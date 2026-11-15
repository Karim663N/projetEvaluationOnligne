import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const submissions = await prisma.submission.findMany({
      where: user.role === "ADMIN" ? {} : { exam: { createdById: user.id } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        exam: { select: { id: true, title: true, passingScore: true, createdById: true } },
        answers: { include: { question: true, selectedOption: true } },
      },
      orderBy: { submittedAt: "asc" },
    });
    const badges = await prisma.badge.findMany({ select: { id: true, name: true, imageUrl: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ submissions, badges }, { status: 200 });
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
    const submission = await prisma.submission.findFirst({
      where: { id: body.submissionId, ...(user.role === "ADMIN" ? {} : { exam: { createdById: user.id } }) },
      include: { exam: true, answers: { include: { question: true } } },
    });
    if (!submission) return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    const badgeId = typeof body.badgeId === "string" && body.badgeId ? body.badgeId : null;
    if (badgeId && !(await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } }))) return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    const updates: { id: string; score: number; feedback: string | null }[] = [];
    for (const item of body.answers) {
      const answer = submission.answers.find((candidate) => candidate.id === item.id);
      const grade = Number(item.score);
      if (!answer || !Number.isFinite(grade) || grade < 0 || grade > answer.question.points) {
        return NextResponse.json({ error: "A grade is invalid or does not belong to this submission" }, { status: 400 });
      }
      updates.push({ id: answer.id, score: grade, feedback: typeof item.feedback === "string" ? item.feedback.slice(0, 2000) : null });
    }
    await prisma.$transaction(updates.map((item) => prisma.answer.update({ where: { id: item.id }, data: { score: item.score, feedback: item.feedback } })));
    const refreshedAnswers = await prisma.answer.findMany({ where: { submissionId: submission.id }, include: { question: true } });
    const score = refreshedAnswers.reduce((sum, answer) => sum + answer.score, 0);
    const pointsTotal = await prisma.question.aggregate({ where: { examId: submission.examId }, _sum: { points: true } });
    const maxScore = pointsTotal._sum.points ?? 0;
    const graded = await prisma.submission.update({
      where: { id: submission.id },
      data: { score, totalScore: maxScore, status: "GRADED", feedback: typeof body.feedback === "string" ? body.feedback.slice(0, 4000) : null, completedAt: new Date() },
    });
    if (badgeId) await prisma.userBadge.upsert({ where: { userId_badgeId: { userId: submission.userId, badgeId } }, create: { userId: submission.userId, badgeId }, update: {} });
    if (maxScore > 0 && (score / maxScore) * 100 >= submission.exam.passingScore) {
      const existing = await prisma.certificate.findFirst({ where: { userId: submission.userId, examTitle: submission.exam.title } });
      if (!existing) await prisma.certificate.create({ data: { userId: submission.userId, examTitle: submission.exam.title } });
    }
    return NextResponse.json({ submission: { id: graded.id, score: graded.score, totalScore: graded.totalScore, status: graded.status } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
