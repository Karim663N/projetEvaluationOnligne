import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Only students can submit exams" }, { status: 403 });

    const { id: examId } = await params;
    const body = await request.json();
    const { answers } = body; // { questionId, selectedOptionId | selectedOptionIds | textResponse }

    if (!answers || !Array.isArray(answers)) {
      return NextResponse.json({ error: "Answers are required" }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({
      where: { id: examId },
      include: {
        questions: {
          include: {
            options: true,
          },
        },
      },
    });

    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    const existingAttempt = await prisma.submission.findFirst({ where: { examId, userId: user.id }, include: { answers: true } });
    if (!existingAttempt && !exam.published) return NextResponse.json({ error: "This exam is not available" }, { status: 403 });
    if (!existingAttempt && exam.classId) {
      const enrollment = await prisma.classEnrollment.findUnique({ where: { classId_userId: { classId: exam.classId, userId: user.id } }, select: { status: true } });
      if (enrollment?.status !== "APPROVED") return NextResponse.json({ error: "Class enrollment is required" }, { status: 403 });
    }
    if (!existingAttempt) return NextResponse.json({ error: "Start the exam before submitting" }, { status: 409 });
    if (existingAttempt && existingAttempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "You have already submitted this exam" }, { status: 409 });
    const attemptExpired = existingAttempt && Date.now() >= existingAttempt.startedAt.getTime() + exam.duration * 60_000;
    const persistedAnswers = existingAttempt?.answers ?? [];

    let score = 0;
    let totalScore = 0;

    const answerCreations: { questionId: string; selectedOptionId?: string; textResponse?: string; score: number }[] = [];
    let hasEssay = false;

    for (const q of exam.questions) {
      totalScore += q.points;
      let userAns = answers.find((a: { questionId: string }) => a.questionId === q.id);
      if (attemptExpired) {
        const saved = persistedAnswers.filter((answer) => answer.questionId === q.id);
        userAns = q.questionType === "TEXT_ESSAY"
          ? { questionId: q.id, textResponse: saved[0]?.textResponse ?? "" }
          : { questionId: q.id, selectedOptionIds: saved.flatMap((answer) => answer.selectedOptionId ? [answer.selectedOptionId] : []) };
      }
      if (q.questionType === "TEXT_ESSAY") {
        hasEssay = true;
        const textResponse = typeof userAns?.textResponse === "string" ? userAns.textResponse.slice(0, 20000) : "";
        answerCreations.push({ questionId: q.id, textResponse, score: 0 });
        continue;
      }
      if (!userAns) continue;
      const ids: string[] = Array.isArray(userAns.selectedOptionIds)
        ? userAns.selectedOptionIds
        : typeof userAns.selectedOptionId === "string" ? [userAns.selectedOptionId] : [];
      const selected = ids.map((id) => q.options.find((option) => option.id === id));
      if (selected.some((option) => !option) || new Set(ids).size !== ids.length) {
        return NextResponse.json({ error: "An answer contains an option that does not belong to its question" }, { status: 400 });
      }
      const correctIds = q.options.filter((option) => option.isCorrect).map((option) => option.id).sort();
      const submittedIds = ids.slice().sort();
      const correct = submittedIds.length > 0 && correctIds.length === submittedIds.length && correctIds.every((id, index) => id === submittedIds[index]);
      if (correct) score += q.points;
      for (const id of ids) answerCreations.push({ questionId: q.id, selectedOptionId: id, score: correct ? q.points / ids.length : 0 });
    }

    const submission = existingAttempt
      ? await prisma.submission.update({
          where: { id: existingAttempt.id },
          data: { score, totalScore, status: hasEssay ? "SUBMITTED" : "GRADED", completedAt: new Date(), answers: { deleteMany: {}, create: answerCreations } },
        })
      : await prisma.submission.create({
          data: { examId, userId: user.id, score, totalScore, status: hasEssay ? "SUBMITTED" : "GRADED", completedAt: new Date(), answers: { create: answerCreations } },
        });

    if (!hasEssay && totalScore > 0 && (score / totalScore) * 100 >= exam.passingScore) {
      const certificate = await prisma.certificate.findFirst({ where: { userId: user.id, examTitle: exam.title } });
      if (!certificate) await prisma.certificate.create({ data: { userId: user.id, examTitle: exam.title } });
    }

    return NextResponse.json({ message: "Exam submitted successfully", submission: { id: submission.id, score: submission.score, totalScore: submission.totalScore, status: submission.status, submittedAt: submission.submittedAt } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
