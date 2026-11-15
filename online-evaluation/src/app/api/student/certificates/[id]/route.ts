import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const rows = await prisma.$queryRaw<Array<{ id: string; userId: string; examTitle: string; description: string | null; issuerName: string | null; issuedAt: Date; code: string; studentName: string }>>`
      SELECT c."id", c."userId", c."examTitle", c."description", c."issuerName", c."issuedAt", c."code", u."name" AS "studentName"
      FROM "Certificate" c INNER JOIN "User" u ON u."id" = c."userId"
      WHERE c."id" = ${id} AND c."userId" = ${user.id} LIMIT 1
    `;
    const row = rows[0];
    const certificate = row ? { ...row, user: { name: row.studentName } } : null;
    if (!certificate) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    return NextResponse.json({ certificate }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
