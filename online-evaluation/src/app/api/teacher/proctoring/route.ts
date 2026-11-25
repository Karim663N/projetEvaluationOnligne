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
    const reports = await prisma.proctoringReport.findMany({
      where: user.role === "ADMIN" ? {} : { submission: { exam: { createdById: user.id } } },
      include: {
        submission: {
          select: {
            id: true, score: true, totalScore: true, status: true, submittedAt: true, startedAt: true, completedAt: true,
            user: { select: { id: true, name: true, email: true } },
            exam: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    const items = reports
      .map((r) => ({ ...r, browserEvents: parse(r.browserEvents), details: parse(r.details) }))
      .sort((a, b) => Number(b.alert) - Number(a.alert) || (b.fusedScore ?? -1) - (a.fusedScore ?? -1));
    let mlService: unknown = null;
    try {
      const res = await fetch(`${ML_API_URL}/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
      mlService = res.ok ? await res.json() : { status: `HTTP ${res.status}` };
    } catch {
      mlService = { status: "injoignable", url: ML_API_URL };
    }
    return NextResponse.json({ reports: items, mlService }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
