import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const { userId, badgeId, classId } = body;
    if (!userId || !badgeId) return NextResponse.json({ error: "User ID and Badge ID are required" }, { status: 400 });
    const student = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!student || student.role !== "STUDENT") return NextResponse.json({ error: "Badges can only be awarded to student accounts" }, { status: 400 });

    const enrollment = await prisma.classEnrollment.findFirst({
      where: { userId, status: "APPROVED", ...(user.role === "TEACHER" ? { schoolClass: { teacherId: user.id } } : classId ? { classId } : {}) },
      select: { id: true },
    });
    if (!enrollment) return NextResponse.json({ error: "Student must be enrolled in one of your classes" }, { status: 403 });
    const badge = await prisma.badge.findUnique({ where: { id: badgeId }, select: { id: true } });
    if (!badge) return NextResponse.json({ error: "Badge not found" }, { status: 404 });

    const existing = await prisma.userBadge.findUnique({ where: { userId_badgeId: { userId, badgeId } } });
    if (existing) return NextResponse.json({ error: "User already has this badge" }, { status: 400 });

    const userBadge = await prisma.userBadge.create({ data: { userId, badgeId } });
    return NextResponse.json({ userBadge }, { status: 201 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
