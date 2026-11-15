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
      include: { exam: { select: { id: true, title: true } }, answers: { include: { question: { include: { options: true } }, selectedOption: true } } },
      orderBy: { submittedAt: "desc" },
    });
    const safeSubmissions = submissions.map((submission) => ({
      ...submission,
      answers: submission.answers.map(({ question, selectedOption, ...answer }) => ({
        ...answer,
        question: { ...question, options: submission.status === "GRADED" ? question.options.map(({ id, text, isCorrect }) => ({ id, text, isCorrect })) : [] },
        selectedOption: selectedOption ? { id: selectedOption.id, text: selectedOption.text } : null,
      })),
    }));
    return NextResponse.json({ submissions: safeSubmissions }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
