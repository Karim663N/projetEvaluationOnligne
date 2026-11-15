import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isUploadedImagePath } from "@/lib/uploads";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const badges = await prisma.badge.findMany({ orderBy: { name: "asc" } });
    const badgeIds = badges.map((b) => b.id);
    const userBadges = badgeIds.length ? await prisma.userBadge.findMany({ where: { badgeId: { in: badgeIds } }, select: { badgeId: true } }) : [];
    const countByBadge = new Map<string, number>();
    for (const ub of userBadges) countByBadge.set(ub.badgeId, (countByBadge.get(ub.badgeId) || 0) + 1);
    return NextResponse.json({ badges: badges.map((b) => ({ ...b, _count: { users: countByBadge.get(b.id) || 0 } })) }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return NextResponse.json({ error: "Badge name must be at least 2 characters" }, { status: 400 });
    const imageUrl = typeof body.imageUrl === "string" && body.imageUrl ? body.imageUrl : null;
    if (imageUrl && !isUploadedImagePath(imageUrl)) return NextResponse.json({ error: "Upload a badge image using the image picker" }, { status: 400 });
    const badge = await prisma.badge.create({ data: { name, description: typeof body.description === "string" ? body.description.trim().slice(0, 500) : null, imageUrl } });
    return NextResponse.json({ badge }, { status: 201 });
  } catch { return NextResponse.json({ error: "A badge with this name may already exist" }, { status: 400 }); }
}
