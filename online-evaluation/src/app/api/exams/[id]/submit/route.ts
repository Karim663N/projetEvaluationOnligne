import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { scoreAndStoreReport, type GradedQuestion, type ProctoringPayload } from "@/lib/proctoring";

type SubmittedAnswer = { questionId: string; selectedOptionId?: string; selectedOptionIds?: string[]; textResponse?: string };

// Accepte le format tableau [{ questionId, ... }] et l'ancien format objet envoye par la page etudiant
// ({ answers: { [questionId]: optionId }, essayAnswers: { [questionId]: texte } }).
function normalizeAnswers(answers: unknown, essayAnswers: unknown): SubmittedAnswer[] | null {
  if (Array.isArray(answers)) return answers as SubmittedAnswer[];
  if (!answers || typeof answers !== "object") return null;
  const out: SubmittedAnswer[] = Object.entries(answers as Record<string, unknown>)
    .filter(([, value]) => typeof value === "string" || Array.isArray(value))
    .map(([questionId, value]) => Array.isArray(value)
      ? { questionId, selectedOptionIds: value.filter((v): v is string => typeof v === "string") }
      : { questionId, selectedOptionId: value as string });
  if (essayAnswers && typeof essayAnswers === "object") {
    for (const [questionId, text] of Object.entries(essayAnswers as Record<string, unknown>)) {
      if (typeof text === "string") out.push({ questionId, textResponse: text });
    }
  }
  return out;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Only students can submit exams" }, { status: 403 });

    const { id: examId } = await params;
    const body = await request.json();
    const answers = normalizeAnswers(body.answers, body.essayAnswers); // { questionId, selectedOptionId | selectedOptionIds | textResponse }
    const proctoring = (body.proctoring && typeof body.proctoring === "object" ? body.proctoring : undefined) as ProctoringPayload | undefined;

    if (!answers) {
      return NextResponse.json({ error: "Answers are required" }, { status: 400 });
    }

    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) {
      return NextResponse.json({ error: "Exam not found" }, { status: 404 });
    }
    const questions = await prisma.question.findMany({ where: { examId }, orderBy: { createdAt: "asc" } });
    const allOptions = await prisma.option.findMany({ where: { questionId: { in: questions.map((q) => q.id) } } });
    const optionsByQuestion = new Map<string, typeof allOptions>();
    for (const o of allOptions) {
      const list = optionsByQuestion.get(o.questionId) ?? [];
      list.push(o);
      optionsByQuestion.set(o.questionId, list);
    }
    const examWithQuestions = { ...exam, questions: questions.map((q) => ({ ...q, options: optionsByQuestion.get(q.id) ?? [] })) };

    const existingAttempt = await prisma.submission.findFirst({ where: { examId, userId: user.id } });
    const persistedAnswers = existingAttempt
      ? await prisma.answer.findMany({ where: { submissionId: existingAttempt.id } })
      : [];
    if (!existingAttempt && !exam.published) return NextResponse.json({ error: "This exam is not available" }, { status: 403 });
    if (!existingAttempt && exam.classId) {
      const enrollment = await prisma.classEnrollment.findFirst({ where: { classId: exam.classId, userId: user.id }, select: { status: true } });
      if (enrollment?.status !== "APPROVED") return NextResponse.json({ error: "Class enrollment is required" }, { status: 403 });
    }
    if (!existingAttempt) return NextResponse.json({ error: "Start the exam before submitting" }, { status: 409 });
    if (existingAttempt && existingAttempt.status !== "IN_PROGRESS") return NextResponse.json({ error: "You have already submitted this exam" }, { status: 409 });
    const attemptExpired = existingAttempt && Date.now() >= existingAttempt.startedAt.getTime() + exam.duration * 60_000;

    let score = 0;
    let totalScore = 0;

    const answerCreations: { submissionId: string; questionId: string; selectedOptionId?: string; textResponse?: string; score: number }[] = [];
    const graded: GradedQuestion[] = []; // pour le module ML : repondue ? juste ?
    let hasEssay = false;

    for (const q of examWithQuestions.questions) {
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
        answerCreations.push({ submissionId: existingAttempt!.id, questionId: q.id, textResponse, score: 0 });
        // correction manuelle a venir : comptee comme repondue, non juste, pour le module ML
        graded.push({ id: q.id, answered: textResponse.trim().length > 0, correct: false });
        continue;
      }
      if (!userAns) { graded.push({ id: q.id, answered: false, correct: false }); continue; }
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
      graded.push({ id: q.id, answered: ids.length > 0, correct });
      for (const id of ids) answerCreations.push({ submissionId: existingAttempt!.id, questionId: q.id, selectedOptionId: id, score: correct ? q.points / ids.length : 0 });
    }

    // Remplace les reponses : suppression puis recreation (MongoDB : pas d'ecriture imbriquee).
    await prisma.$transaction([
      prisma.answer.deleteMany({ where: { submissionId: existingAttempt!.id } }),
      ...answerCreations.map((row) => prisma.answer.create({ data: row })),
    ]);
    const submission = await prisma.submission.update({
      where: { id: existingAttempt!.id },
      data: { score, totalScore, status: hasEssay ? "SUBMITTED" : "GRADED", completedAt: new Date() },
    });

    if (!hasEssay && totalScore > 0 && (score / totalScore) * 100 >= exam.passingScore) {
      const certificate = await prisma.certificate.findFirst({ where: { userId: user.id, examTitle: exam.title } });
      if (!certificate) await prisma.certificate.create({ data: { userId: user.id, examTitle: exam.title } });
    }

    // Module ML ExamGuard AI : score de risque + explication (n'empeche jamais la remise de la copie)
    const startedAt = existingAttempt?.startedAt ?? submission.startedAt;
    await scoreAndStoreReport({
      submissionId: submission.id,
      examId: exam.id,
      examDurationMin: exam.duration,
      questions: graded,
      sessionSeconds: (Date.now() - startedAt.getTime()) / 1000,
      payload: proctoring,
    }).catch(() => null);

    return NextResponse.json({ message: "Exam submitted successfully", submission: { id: submission.id, score: submission.score, totalScore: submission.totalScore, status: submission.status, submittedAt: submission.submittedAt } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
