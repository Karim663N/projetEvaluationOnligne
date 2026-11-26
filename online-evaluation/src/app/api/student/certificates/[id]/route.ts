import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const certificate = await prisma.certificate.findFirst({ where: { id, userId: user.id } });
    if (!certificate) return NextResponse.json({ error: "Certificate not found" }, { status: 404 });
    const student = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    return NextResponse.json({ certificate: { ...certificate, user: { name: student?.name ?? "" } } }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
