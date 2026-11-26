import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Etudiant : examens sans classe + examens des classes ou il est inscrit (APPROVED).
    let studentClassIds: string[] = [];
    if (user.role === "STUDENT") {
      const enrollments = await prisma.classEnrollment.findMany({
        where: { userId: user.id, status: "APPROVED" },
        select: { classId: true },
      });
      studentClassIds = enrollments.map((e) => e.classId);
    }

    const exams = await prisma.exam.findMany({
      where:
        user.role === "ADMIN"
          ? {}
          : user.role === "TEACHER"
            ? { createdById: user.id }
            : {
                published: true,
                OR: [{ classId: null }, { classId: { in: studentClassIds } }],
              },
      orderBy: { createdAt: "desc" },
    });
    const examIds = exams.map((e) => e.id);

    const [questions, creators, mySubmissions] = await Promise.all([
      prisma.question.findMany({ where: { examId: { in: examIds } }, select: { examId: true } }),
      prisma.user.findMany({
        where: { id: { in: exams.map((e) => e.createdById) } },
        select: { id: true, name: true },
      }),
      user.role === "STUDENT"
        ? prisma.submission.findMany({
            where: { examId: { in: examIds }, userId: user.id },
            select: { examId: true, status: true, score: true, totalScore: true },
          })
        : Promise.resolve([]),
    ]);

    const questionCounts = new Map<string, number>();
    for (const q of questions) questionCounts.set(q.examId, (questionCounts.get(q.examId) ?? 0) + 1);
    const creatorMap = new Map(creators.map((c) => [c.id, c]));
    const submissionsByExam = new Map<string, typeof mySubmissions>();
    for (const s of mySubmissions) {
      const list = submissionsByExam.get(s.examId) ?? [];
      list.push(s);
      submissionsByExam.set(s.examId, list);
    }

    const result = exams.map((exam) => ({
      ...exam,
      createdBy: creatorMap.get(exam.createdById) ?? null,
      _count: { questions: questionCounts.get(exam.id) ?? 0 },
      ...(user.role === "STUDENT" ? { submissions: submissionsByExam.get(exam.id) ?? [] } : {}),
    }));

    return NextResponse.json({ exams: result }, { status: 200 });
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
