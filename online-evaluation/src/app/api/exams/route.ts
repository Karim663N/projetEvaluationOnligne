import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    let where: Prisma.ExamWhereInput;
    if (user.role === "ADMIN") {
      where = {};
    } else if (user.role === "TEACHER") {
      where = { createdById: user.id };
    } else {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { userId: user.id, status: "APPROVED" },
        select: { classId: true },
      });
      const classIds = enrollments.map((e) => e.classId);
      where = { published: true, OR: [{ classId: null }, { classId: { in: classIds } }] };
    }

    const exams = await prisma.exam.findMany({ where });
    const examIds = exams.map((e) => e.id);
    const questions = examIds.length
      ? await prisma.question.findMany({ where: { examId: { in: examIds } }, select: { examId: true } })
      : [];
    const questionCount = new Map<string, number>();
    for (const q of questions) questionCount.set(q.examId, (questionCount.get(q.examId) || 0) + 1);
    const examsWithCount = exams.map((exam) => ({
      ...exam,
      _count: { questions: questionCount.get(exam.id) || 0 },
    }));
    return NextResponse.json({ exams: examsWithCount }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN" && user.role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, duration, published } = body;

    const parsedDuration = Number(duration);
    const parsedPassingScore = Number(body.passingScore ?? 60);
    if (typeof title !== "string" || title.trim().length < 2 || !Number.isInteger(parsedDuration) || parsedDuration < 1 || parsedDuration > 600) {
      return NextResponse.json({ error: "Title and duration are required" }, { status: 400 });
    }
    if (!Number.isFinite(parsedPassingScore) || parsedPassingScore < 0 || parsedPassingScore > 100) {
      return NextResponse.json({ error: "Passing score must be from 0 to 100" }, { status: 400 });
    }
    if (published === true) return NextResponse.json({ error: "Add questions before publishing this exam" }, { status: 400 });

    const classId = typeof body.classId === "string" && body.classId ? body.classId : null;
    if (classId) {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id: classId }, select: { id: true, teacherId: true } });
      if (!schoolClass || (user.role === "TEACHER" && schoolClass.teacherId !== user.id)) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    }

    const exam = await prisma.exam.create({
      data: {
        title: title.trim(),
        description,
        duration: parsedDuration,
        passingScore: parsedPassingScore,
        classId,
        published: false,
        createdById: user.id,
      },
    });
    await writeAuditLog(user.id, "EXAM_CREATED", exam.id, exam.title);

    return NextResponse.json({ message: "Exam created successfully", exam }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
