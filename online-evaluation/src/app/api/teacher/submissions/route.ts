import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let examFilter: { examId?: { in: string[] } } = {};
    if (user.role !== "ADMIN") {
      const teacherExams = await prisma.exam.findMany({ where: { createdById: user.id }, select: { id: true } });
      examFilter = { examId: { in: teacherExams.map((e) => e.id) } };
    }

    const submissions = await prisma.submission.findMany({
      where: examFilter,
      orderBy: { submittedAt: "asc" },
    });
    const submissionIds = submissions.map((s) => s.id);
    const examIds = [...new Set(submissions.map((s) => s.examId))];
    const userIds = [...new Set(submissions.map((s) => s.userId))];

    const [users, exams, answers] = await Promise.all([
      userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
      examIds.length ? prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true, passingScore: true, createdById: true } }) : [],
      submissionIds.length ? prisma.answer.findMany({ where: { submissionId: { in: submissionIds } } }) : [],
    ]);
    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const optionIds = [...new Set(answers.map((a) => a.selectedOptionId).filter((x): x is string => Boolean(x)))];
    const [questions, options] = await Promise.all([
      questionIds.length ? prisma.question.findMany({ where: { id: { in: questionIds } } }) : [],
      optionIds.length ? prisma.option.findMany({ where: { id: { in: optionIds } } }) : [],
    ]);

    const userMap = new Map(users.map((u) => [u.id, u]));
    const examMap = new Map(exams.map((e) => [e.id, e]));
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const optionMap = new Map(options.map((o) => [o.id, o]));
    const answersBySubmission = new Map<string, typeof answers>();
    for (const a of answers) {
      const list = answersBySubmission.get(a.submissionId) || [];
      list.push(a);
      answersBySubmission.set(a.submissionId, list);
    }

    const serialized = submissions.map((s) => ({
      ...s,
      user: userMap.get(s.userId) || null,
      exam: examMap.get(s.examId)
        ? { id: examMap.get(s.examId)!.id, title: examMap.get(s.examId)!.title, passingScore: examMap.get(s.examId)!.passingScore, createdById: examMap.get(s.examId)!.createdById }
        : null,
      answers: (answersBySubmission.get(s.id) || []).map((a) => ({
        ...a,
        question: questionMap.get(a.questionId) || null,
        selectedOption: a.selectedOptionId ? optionMap.get(a.selectedOptionId) || null : null,
      })),
    }));

    const badges = await prisma.badge.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ submissions: serialized, badges }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    if (typeof body.submissionId !== "string" || !Array.isArray(body.answers)) return NextResponse.json({ error: "Submission and answer grades are required" }, { status: 400 });

    const submission = await prisma.submission.findFirst({ where: { id: body.submissionId } });
    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    if (user.role !== "ADMIN") {
      const exam = await prisma.exam.findUnique({ where: { id: submission.examId }, select: { createdById: true } });
      if (!exam || exam.createdById !== user.id) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }
    const exam = await prisma.exam.findUnique({ where: { id: submission.examId } });
    if (!exam) return NextResponse.json({ error: "Submission not found" }, { status: 404 });

    const badgeId = typeof body.badgeId === "string" && body.badgeId ? body.badgeId : null;
    if (badgeId && !(await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } }))) return NextResponse.json({ error: "Badge not found" }, { status: 404 });

    const existingAnswers = await prisma.answer.findMany({ where: { submissionId: submission.id } });
    const answerQuestionIds = [...new Set(existingAnswers.map((a) => a.questionId))];
    const questions = answerQuestionIds.length ? await prisma.question.findMany({ where: { id: { in: answerQuestionIds } } }) : [];
    const questionMap = new Map(questions.map((q) => [q.id, q]));

    const updates: { id: string; score: number; feedback: string | null }[] = [];
    for (const item of body.answers) {
      const answer = existingAnswers.find((candidate) => candidate.id === item.id);
      const question = answer ? questionMap.get(answer.questionId) : null;
      const grade = Number(item.score);
      if (!answer || !question || !Number.isFinite(grade) || grade < 0 || grade > question.points) {
        return NextResponse.json({ error: "A grade is invalid or does not belong to this submission" }, { status: 400 });
      }
      updates.push({ id: answer.id, score: grade, feedback: typeof item.feedback === "string" ? item.feedback.slice(0, 2000) : null });
    }
    for (const item of updates) {
      await prisma.answer.update({ where: { id: item.id }, data: { score: item.score, feedback: item.feedback } });
    }
    const refreshedAnswers = await prisma.answer.findMany({ where: { submissionId: submission.id } });
    const score = refreshedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const examQuestions = await prisma.question.findMany({ where: { examId: submission.examId }, select: { points: true } });
    const maxScore = examQuestions.reduce((sum, q) => sum + q.points, 0);
    const graded = await prisma.submission.update({
      where: { id: submission.id },
      data: { score, totalScore: maxScore, status: "GRADED", feedback: typeof body.feedback === "string" ? body.feedback.slice(0, 4000) : null, completedAt: new Date() },
    });
    if (badgeId) {
      const existingBadge = await prisma.userBadge.findFirst({ where: { userId: submission.userId, badgeId } });
      if (!existingBadge) await prisma.userBadge.create({ data: { userId: submission.userId, badgeId } });
    }
    if (maxScore > 0 && (score / maxScore) * 100 >= exam.passingScore) {
      const existing = await prisma.certificate.findFirst({ where: { userId: submission.userId, examTitle: exam.title } });
      if (!existing) await prisma.certificate.create({ data: { userId: submission.userId, examTitle: exam.title, code: randomUUID() } });
    }
    return NextResponse.json({ submission: { id: graded.id, score: graded.score, totalScore: graded.totalScore, status: graded.status } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
