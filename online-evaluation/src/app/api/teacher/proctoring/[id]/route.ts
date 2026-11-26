import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const STATUSES = ["PENDING", "CONFIRMED", "REJECTED", "REVIEW"] as const;

// Decision humaine sur une alerte (EF9) : confirmer, rejeter ou demander une revue. Journalisee.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });

    const report = await prisma.proctoringReport.findUnique({ where: { id }, select: { id: true, submissionId: true } });
    if (!report) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    if (user.role === "TEACHER") {
      const submission = await prisma.submission.findUnique({ where: { id: report.submissionId }, select: { examId: true } });
      const exam = submission ? await prisma.exam.findUnique({ where: { id: submission.examId }, select: { createdById: true } }) : null;
      if (!exam || exam.createdById !== user.id) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const note = typeof body.note === "string" ? body.note.slice(0, 2000) : null;
    const updated = await prisma.proctoringReport.update({
      where: { id },
      data: { status: body.status, decisionNote: note, decidedById: user.id, decidedAt: new Date() },
    });
    await writeAuditLog(user.id, "PROCTORING_DECISION", report.submissionId, JSON.stringify({ status: body.status, note }));
    return NextResponse.json({ report: { id: updated.id, status: updated.status, decisionNote: updated.decisionNote, decidedAt: updated.decidedAt } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
