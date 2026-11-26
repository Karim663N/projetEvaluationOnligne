import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Filtre "exam.createdById = user" remplace par une recherche d'examens puis de copies.
    const exams = await prisma.exam.findMany({
      where: user.role === "ADMIN" ? {} : { createdById: user.id },
      select: { id: true, title: true, passingScore: true, createdById: true },
    });
    const examMap = new Map(exams.map((e) => [e.id, e]));

    const submissions = await prisma.submission.findMany({
      where: { examId: { in: exams.map((e) => e.id) } },
      orderBy: { submittedAt: "asc" },
    });
    const submissionIds = submissions.map((s) => s.id);
    const userIds = [...new Set(submissions.map((s) => s.userId))];

    const [users, answers] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
      prisma.answer.findMany({ where: { submissionId: { in: submissionIds } } }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));

    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const selectedOptionIds = [...new Set(answers.map((a) => a.selectedOptionId).filter((v): v is string => Boolean(v)))];
    const [questions, selectedOptions] = await Promise.all([
      prisma.question.findMany({ where: { id: { in: questionIds } } }),
      prisma.option.findMany({ where: { id: { in: selectedOptionIds } } }),
    ]);
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const selectedMap = new Map(selectedOptions.map((o) => [o.id, o]));
    const answersBySubmission = new Map<string, typeof answers>();
    for (const a of answers) {
      const list = answersBySubmission.get(a.submissionId) ?? [];
      list.push(a);
      answersBySubmission.set(a.submissionId, list);
    }

    const badges = await prisma.badge.findMany({ select: { id: true, name: true, imageUrl: true }, orderBy: { name: "asc" } });

    const result = submissions.map((s) => ({
      ...s,
      user: userMap.get(s.userId) ?? null,
      exam: examMap.get(s.examId) ?? null,
      answers: (answersBySubmission.get(s.id) ?? []).map((a) => ({
        ...a,
        question: questionMap.get(a.questionId) ?? null,
        selectedOption: a.selectedOptionId ? selectedMap.get(a.selectedOptionId) ?? null : null,
      })),
    }));

    return NextResponse.json({ submissions: result, badges }, { status: 200 });
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

    const examFilter = user.role === "ADMIN" ? {} : { createdById: user.id };
    const ownedExams = await prisma.exam.findMany({ where: examFilter, select: { id: true } });
    const submission = await prisma.submission.findFirst({
      where: { id: body.submissionId, examId: { in: ownedExams.map((e) => e.id) } },
    });
    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const exam = await prisma.exam.findUnique({ where: { id: submission.examId } });
    if (!exam) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const answers = await prisma.answer.findMany({ where: { submissionId: submission.id } });
    const badgeId = typeof body.badgeId === "string" && body.badgeId ? body.badgeId : null;
    if (badgeId && !(await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } }))) return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    const questionIds = [...new Set(answers.map((a) => a.questionId))];
    const questions = await prisma.question.findMany({ where: { id: { in: questionIds } } });
    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const updates: { id: string; score: number; feedback: string | null }[] = [];
    for (const item of body.answers) {
      const answer = answers.find((candidate) => candidate.id === item.id);
      const question = answer ? questionMap.get(answer.questionId) : null;
      const grade = Number(item.score);
      if (!answer || !question || !Number.isFinite(grade) || grade < 0 || grade > question.points) {
        return NextResponse.json({ error: "A grade is invalid or does not belong to this submission" }, { status: 400 });
      }
      updates.push({ id: answer.id, score: grade, feedback: typeof item.feedback === "string" ? item.feedback.slice(0, 2000) : null });
    }
    await prisma.$transaction(updates.map((item) => prisma.answer.update({ where: { id: item.id }, data: { score: item.score, feedback: item.feedback } })));
    const refreshedAnswers = await prisma.answer.findMany({ where: { submissionId: submission.id } });
    const score = refreshedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const pointsTotal = await prisma.question.aggregate({ where: { examId: submission.examId }, _sum: { points: true } });
    const maxScore = pointsTotal._sum.points ?? 0;
    const graded = await prisma.submission.update({
      where: { id: submission.id },
      data: { score, totalScore: maxScore, status: "GRADED", feedback: typeof body.feedback === "string" ? body.feedback.slice(0, 4000) : null, completedAt: new Date() },
    });
    if (badgeId) {
      const existing = await prisma.userBadge.findFirst({ where: { userId: submission.userId, badgeId } });
      if (!existing) await prisma.userBadge.create({ data: { userId: submission.userId, badgeId } });
    }
    if (maxScore > 0 && (score / maxScore) * 100 >= exam.passingScore) {
      const existing = await prisma.certificate.findFirst({ where: { userId: submission.userId, examTitle: exam.title } });
      if (!existing) await prisma.certificate.create({ data: { userId: submission.userId, examTitle: exam.title } });
    }
    return NextResponse.json({ submission: { id: graded.id, score: graded.score, totalScore: graded.totalScore, status: graded.status } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
