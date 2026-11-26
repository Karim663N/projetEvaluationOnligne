import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Tableau de bord enseignant : statistiques par examen, activite des 14 derniers jours,
// repartition des notes, copies recentes, actions en attente.
const DAYS = 14;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const exams = await prisma.exam.findMany({
      where: user.role === "ADMIN" ? {} : { createdById: user.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, published: true, passingScore: true },
    });
    const examIds = exams.map((e) => e.id);

    const [questions, submissions] = await Promise.all([
      prisma.question.findMany({ where: { examId: { in: examIds } }, select: { examId: true } }),
      prisma.submission.findMany({
        where: { examId: { in: examIds }, status: { not: "IN_PROGRESS" } },
        select: { id: true, examId: true, userId: true, score: true, totalScore: true, status: true, submittedAt: true, completedAt: true },
      }),
    ]);

    const submissionIds = submissions.map((s) => s.id);
    const userIds = [...new Set(submissions.map((s) => s.userId))];
    const [users, reports] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
      prisma.proctoringReport.findMany({
        where: { submissionId: { in: submissionIds } },
        select: { submissionId: true, alert: true, status: true, fusedScore: true },
      }),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const reportMap = new Map(reports.map((r) => [r.submissionId, r]));

    const questionCounts = new Map<string, number>();
    for (const q of questions) questionCounts.set(q.examId, (questionCounts.get(q.examId) ?? 0) + 1);

    const submissionsByExam = new Map<string, typeof submissions>();
    for (const s of submissions) {
      const list = submissionsByExam.get(s.examId) ?? [];
      list.push(s);
      submissionsByExam.set(s.examId, list);
    }

    const ratio = (s: { score: number; totalScore: number }) => (s.totalScore > 0 ? s.score / s.totalScore : null);
    const examsWithSubmissions = exams.map((e) => ({
      ...e,
      _count: { questions: questionCounts.get(e.id) ?? 0 },
      submissions: (submissionsByExam.get(e.id) ?? []).map((s) => ({
        ...s,
        user: userMap.get(s.userId) ?? { name: "Inconnu" },
        proctoring: reportMap.get(s.id) ?? null,
      })),
    }));

    const perExam = examsWithSubmissions.map((e) => {
      const graded = e.submissions.filter((s) => s.status === "GRADED" && s.totalScore > 0);
      const ratios = graded.map((s) => ratio(s) as number);
      return {
        id: e.id,
        submissions: e.submissions.length,
        toGrade: e.submissions.filter((s) => s.status === "SUBMITTED").length,
        average: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
        passRate: ratios.length ? ratios.filter((r) => 100 * r >= e.passingScore).length / ratios.length : null,
        alerts: e.submissions.filter((s) => s.proctoring?.alert).length,
        pendingAlerts: e.submissions.filter((s) => s.proctoring?.alert && s.proctoring.status === "PENDING").length,
      };
    });

    const all = examsWithSubmissions.flatMap((e) => e.submissions.map((s) => ({ ...s, examTitle: e.title, at: s.completedAt ?? s.submittedAt })));
    const gradedRatios = all.filter((s) => s.status === "GRADED" && s.totalScore > 0).map((s) => ratio(s) as number);

    // copies remises par jour (14 derniers jours, jour local du serveur)
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daily = Array.from({ length: DAYS }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (DAYS - 1 - i));
      // date locale AAAA-MM-JJ (toISOString decalerait d'un jour hors UTC)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date, count: 0, _t: d.getTime() };
    });
    for (const s of all) {
      const t = new Date(s.at); t.setHours(0, 0, 0, 0);
      const slot = daily.find((d) => d._t === t.getTime());
      if (slot) slot.count += 1;
    }

    // repartition des notes : 10 tranches de 10 points de pourcentage
    const distribution = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
    for (const r of gradedRatios) distribution[Math.min(9, Math.floor(r * 10))].count += 1;

    const recent = all
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 6)
      .map((s) => ({
        id: s.id, student: s.user.name, exam: s.examTitle, at: s.at, status: s.status,
        score: s.score, totalScore: s.totalScore,
        alert: Boolean(s.proctoring?.alert), risk: s.proctoring?.fusedScore ?? null,
      }));

    return NextResponse.json({
      totals: {
        exams: exams.length,
        published: exams.filter((e) => e.published).length,
        submissions: all.length,
        average: gradedRatios.length ? gradedRatios.reduce((a, b) => a + b, 0) / gradedRatios.length : null,
        toGrade: all.filter((s) => s.status === "SUBMITTED").length,
        pendingAlerts: perExam.reduce((s, e) => s + e.pendingAlerts, 0),
        emptyDrafts: examsWithSubmissions.filter((e) => !e.published && e._count.questions === 0).length,
      },
      perExam,
      daily: daily.map(({ date, count }) => ({ date, count })),
      distribution,
      recent,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
