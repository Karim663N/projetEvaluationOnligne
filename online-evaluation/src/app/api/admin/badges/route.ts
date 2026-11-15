import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const badges = await prisma.badge.findMany({ include: { _count: { select: { users: true } } }, orderBy: { name: "asc" } });
    return NextResponse.json({ badges }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return NextResponse.json({ error: "Badge name must be at least 2 characters" }, { status: 400 });
    const badge = await prisma.badge.create({ data: { name, description: typeof body.description === "string" ? body.description.trim() : null, imageUrl: typeof body.imageUrl === "string" ? body.imageUrl : null } });
    return NextResponse.json({ badge }, { status: 201 });
  } catch { return NextResponse.json({ error: "A badge with this name may already exist" }, { status: 400 }); }
}
