import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ML_API_URL } from "@/lib/proctoring";

function parse(json: string) {
  try { return JSON.parse(json); } catch { return {}; }
}

// Rapports de surveillance des copies des examens de l'enseignant (tous pour un administrateur).
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // "submission.exam.createdById = user" remplace par les ids de copies des examens de l'enseignant.
    let submissionIds: string[] | null = null;
    if (user.role === "TEACHER") {
      const exams = await prisma.exam.findMany({ where: { createdById: user.id }, select: { id: true } });
      const subs = await prisma.submission.findMany({ where: { examId: { in: exams.map((e) => e.id) } }, select: { id: true } });
      submissionIds = subs.map((s) => s.id);
      if (submissionIds.length === 0) {
        return NextResponse.json({ reports: [], mlService: await mlHealth() }, { status: 200 });
      }
    }

    const reports = await prisma.proctoringReport.findMany({
      where: submissionIds ? { submissionId: { in: submissionIds } } : {},
      orderBy: { createdAt: "desc" },
    });

    const subIds = reports.map((r) => r.submissionId);
    const submissions = await prisma.submission.findMany({
      where: { id: { in: subIds } },
      select: { id: true, examId: true, userId: true, score: true, totalScore: true, status: true, submittedAt: true, startedAt: true, completedAt: true },
    });
    const examIds = [...new Set(submissions.map((s) => s.examId))];
    const [users, exams] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: [...new Set(submissions.map((s) => s.userId))] } }, select: { id: true, name: true, email: true } }),
      prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true } }),
    ]);
    const examMap = new Map(exams.map((e) => [e.id, e]));
    const userMap = new Map(users.map((u) => [u.id, u]));
    const submissionMap = new Map(submissions.map((s) => [s.id, s]));

    const items = reports
      .map((r) => {
        const s = submissionMap.get(r.submissionId);
        const exam = s ? examMap.get(s.examId) : null;
        return {
          ...r,
          browserEvents: parse(r.browserEvents),
          details: parse(r.details),
          submission: s
            ? {
                id: s.id, score: s.score, totalScore: s.totalScore, status: s.status,
                submittedAt: s.submittedAt, startedAt: s.startedAt, completedAt: s.completedAt,
                user: s ? userMap.get(s.userId) ?? null : null,
                exam: exam ? { id: exam.id, title: exam.title } : null,
              }
            : null,
        };
      })
      .sort((a, b) => Number(b.alert) - Number(a.alert) || (b.fusedScore ?? -1) - (a.fusedScore ?? -1));

    return NextResponse.json({ reports: items, mlService: await mlHealth() }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

async function mlHealth() {
  try {
    const res = await fetch(`${ML_API_URL}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
    return res.ok ? await res.json() : { status: `HTTP ${res.status}` };
  } catch {
    return { status: "injoignable", url: ML_API_URL };
  }
}
