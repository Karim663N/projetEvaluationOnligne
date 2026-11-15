import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const where: Prisma.ExamWhereInput = user.role === "ADMIN" ? {} : user.role === "TEACHER"
      ? { createdById: user.id }
      : { published: true, OR: [{ classId: null }, { schoolClass: { enrollments: { some: { userId: user.id, status: "APPROVED" } } } }] };

    const exams = await prisma.exam.findMany({
      where,
      include: {
        createdBy: { select: { name: true } },
        _count: {
          select: { questions: true },
        },
      },
    });
    return NextResponse.json({ exams }, { status: 200 });
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
