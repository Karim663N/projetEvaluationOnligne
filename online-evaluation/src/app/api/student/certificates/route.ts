import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const certificates = await prisma.certificate.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
    });
    return NextResponse.json({ certificates }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Could not load certificates" }, { status: 500 });
  }
}
