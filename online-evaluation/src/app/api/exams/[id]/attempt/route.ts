import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id: examId } = await params;
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { id: true, duration: true, published: true, classId: true } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    const questions = await prisma.question.findMany({ where: { examId }, select: { id: true, points: true } });
    let attempt = await prisma.submission.findFirst({ where: { examId, userId: user.id } });
    if (!attempt && !exam.published) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (!attempt && exam.classId) {
      const enrollment = await prisma.classEnrollment.findFirst({ where: { classId: exam.classId, userId: user.id }, select: { status: true } });
      if (enrollment?.status !== "APPROVED") return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    if (!attempt) {
      attempt = await prisma.submission.create({
        data: { examId, userId: user.id, status: "IN_PROGRESS", totalScore: questions.reduce((sum, q) => sum + q.points, 0) },
      });
    }
    if (attempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "Exam already submitted" }, { status: 409 });
    const expiresAt = new Date(attempt.startedAt.getTime() + exam.duration * 60_000);
    const answers = await prisma.answer.findMany({ where: { submissionId: attempt.id }, select: { questionId: true, selectedOptionId: true, textResponse: true } });
    return NextResponse.json({ attempt: { id: attempt.id, startedAt: attempt.startedAt, expiresAt, expired: Date.now() >= expiresAt.getTime() }, answers }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id: examId } = await params;
    const body = await request.json();
    if (!Array.isArray(body.answers)) return NextResponse.json({ error: "Answers must be an array" }, { status: 400 });
    const attempt = await prisma.submission.findFirst({ where: { examId, userId: user.id, status: "IN_PROGRESS" } });
    if (!attempt) return NextResponse.json({ error: "No active attempt" }, { status: 404 });
    const exam = await prisma.exam.findUnique({ where: { id: examId }, select: { duration: true } });
    if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    if (Date.now() >= attempt.startedAt.getTime() + exam.duration * 60_000) return NextResponse.json({ error: "Exam time has expired" }, { status: 410 });
    const questions = await prisma.question.findMany({ where: { examId }, select: { id: true, questionType: true } });
    const options = await prisma.option.findMany({ where: { questionId: { in: questions.map((q) => q.id) } }, select: { id: true, questionId: true } });
    const optionIdsByQuestion = new Map<string, Set<string>>();
    for (const o of options) {
      const set = optionIdsByQuestion.get(o.questionId) ?? new Set<string>();
      set.add(o.id);
      optionIdsByQuestion.set(o.questionId, set);
    }
    const rows: { submissionId: string; questionId: string; selectedOptionId?: string; textResponse?: string }[] = [];
    for (const item of body.answers) {
      const question = questions.find((candidate) => candidate.id === item.questionId);
      if (!question) return NextResponse.json({ error: "Answer includes an unrelated question" }, { status: 400 });
      if (question.questionType === "TEXT_ESSAY") {
        rows.push({ submissionId: attempt.id, questionId: question.id, textResponse: typeof item.textResponse === "string" ? item.textResponse.slice(0, 20000) : "" });
        continue;
      }
      const ids: string[] = Array.isArray(item.selectedOptionIds) ? item.selectedOptionIds : typeof item.selectedOptionId === "string" ? [item.selectedOptionId] : [];
      const validOptionIds = optionIdsByQuestion.get(question.id) ?? new Set<string>();
      if (ids.some((id) => !validOptionIds.has(id))) return NextResponse.json({ error: "Answer includes an unrelated option" }, { status: 400 });
      for (const selectedOptionId of new Set(ids)) rows.push({ submissionId: attempt.id, questionId: question.id, selectedOptionId });
    }
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { submissionId: attempt.id } }),
      ...rows.map((row) => prisma.answer.create({ data: row })),
    ]);
    return NextResponse.json({ savedAt: new Date().toISOString() }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
