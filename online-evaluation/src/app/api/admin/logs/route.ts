import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const actorIds = [...new Set(logs.map((l) => l.actorId).filter((v): v is string => Boolean(v)))];
    const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } });
    const actorMap = new Map(actors.map((a) => [a.id, a]));
    return NextResponse.json({
      logs: logs.map((l) => ({ ...l, actor: l.actorId ? actorMap.get(l.actorId) ?? null : null })),
    }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
