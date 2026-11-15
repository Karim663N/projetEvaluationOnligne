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
    const answers = submissionIds.length
      ? await prisma.answer.findMany({ where: { submissionId: { in: submissionIds } } })
      : [];
    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const optionIds = [...new Set(answers.map((a) => a.selectedOptionId).filter((x): x is string => Boolean(x)))];
    const [exams, questions, options] = await Promise.all([
      examIds.length ? prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true } }) : [],
      questionIds.length ? prisma.question.findMany({ where: { id: { in: questionIds } } }) : [],
      optionIds.length ? prisma.option.findMany({ where: { id: { in: optionIds } } }) : [],
    ]);
    const allQuestionIds = questions.map((q) => q.id);
    const allOptions = allQuestionIds.length
      ? await prisma.option.findMany({ where: { questionId: { in: allQuestionIds } } })
      : [];

    const examMap = new Map(exams.map((e) => [e.id, e]));
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const optionsByQuestion = new Map<string, typeof allOptions>();
    for (const opt of allOptions) {
      const list = optionsByQuestion.get(opt.questionId) || [];
      list.push(opt);
      optionsByQuestion.set(opt.questionId, list);
    }
    const answersBySubmission = new Map<string, typeof answers>();
    for (const a of answers) {
      const list = answersBySubmission.get(a.submissionId) || [];
      list.push(a);
      answersBySubmission.set(a.submissionId, list);
    }

    const safeSubmissions = submissions.map((submission) => ({
      ...submission,
      exam: examMap.get(submission.examId) || null,
      answers: (answersBySubmission.get(submission.id) || []).map(({ questionId, selectedOptionId, ...answer }) => {
        const question = questionMap.get(questionId);
        return {
          ...answer,
          question: question
            ? { ...question, options: submission.status === "GRADED" ? (optionsByQuestion.get(question.id) || []).map(({ id, text, isCorrect }) => ({ id, text, isCorrect })) : [] }
            : null,
          selectedOption: selectedOptionId ? { id: selectedOptionId, text: optionMap.get(selectedOptionId)?.text ?? "" } : null,
        };
      }),
    }));
    return NextResponse.json({ submissions: safeSubmissions }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
