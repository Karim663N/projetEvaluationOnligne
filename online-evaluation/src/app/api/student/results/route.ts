import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const submissions = await prisma.submission.findMany({
      where: { userId: user.id, status: { not: "IN_PROGRESS" } },
      orderBy: { submittedAt: "desc" },
    });
    const submissionIds = submissions.map((s) => s.id);
    const examIds = [...new Set(submissions.map((s) => s.examId))];

    const [exams, answers] = await Promise.all([
      prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true } }),
      prisma.answer.findMany({ where: { submissionId: { in: submissionIds } } }),
    ]);
    const examMap = new Map(exams.map((e) => [e.id, e]));
    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const selectedOptionIds = [...new Set(answers.map((a) => a.selectedOptionId).filter((v): v is string => Boolean(v)))];
    const [questions, options, selectedOptions] = await Promise.all([
      prisma.question.findMany({ where: { id: { in: questionIds } } }),
      prisma.option.findMany({ where: { questionId: { in: questionIds } } }),
      prisma.option.findMany({ where: { id: { in: selectedOptionIds } }, select: { id: true, text: true } }),
    ]);
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const optionsByQuestion = new Map<string, typeof options>();
    for (const o of options) {
      const list = optionsByQuestion.get(o.questionId) ?? [];
      list.push(o);
      optionsByQuestion.set(o.questionId, list);
    }
    const selectedMap = new Map(selectedOptions.map((o) => [o.id, o]));
    const answersBySubmission = new Map<string, typeof answers>();
    for (const a of answers) {
      const list = answersBySubmission.get(a.submissionId) ?? [];
      list.push(a);
      answersBySubmission.set(a.submissionId, list);
    }

    const safeSubmissions = submissions.map((submission) => ({
      ...submission,
      exam: examMap.get(submission.examId) ?? null,
      answers: (answersBySubmission.get(submission.id) ?? []).map((answer) => {
        const question = questionMap.get(answer.questionId);
        const selectedOption = answer.selectedOptionId ? selectedMap.get(answer.selectedOptionId) ?? null : null;
        return {
          ...answer,
          question: question
            ? { ...question, options: submission.status === "GRADED" ? (optionsByQuestion.get(question.id) ?? []).map(({ id, text, isCorrect }) => ({ id, text, isCorrect })) : [] }
            : null,
          selectedOption,
        };
      }),
    }));
    return NextResponse.json({ submissions: safeSubmissions }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
