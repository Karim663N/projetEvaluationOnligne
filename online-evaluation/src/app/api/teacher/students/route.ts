import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const classes = await prisma.schoolClass.findMany({
      where: user.role === "TEACHER" ? { teacherId: user.id } : undefined,
    });
    const classIds = classes.map((c) => c.id);
    const classNameById = new Map(classes.map((c) => [c.id, c.name]));

    const enrollments = classIds.length
      ? await prisma.classEnrollment.findMany({ where: { classId: { in: classIds }, status: "APPROVED" }, select: { classId: true, userId: true } })
      : [];
    const studentIds = [...new Set(enrollments.map((e) => e.userId))];

    const students = studentIds.length
      ? await prisma.user.findMany({
          where: { id: { in: studentIds }, role: "STUDENT" },
          select: { id: true, name: true, email: true, avatarUrl: true, cvUrl: true },
        })
      : [];
    const userBadges = studentIds.length
      ? await prisma.userBadge.findMany({ where: { userId: { in: studentIds } } })
      : [];
    const badgeIds = [...new Set(userBadges.map((ub) => ub.badgeId))];
    const badges = badgeIds.length
      ? await prisma.badge.findMany({ where: { id: { in: badgeIds } } })
      : [];

    const badgeMap = new Map(badges.map((b) => [b.id, b]));
    const badgesByUser = new Map<string, typeof userBadges>();
    for (const ub of userBadges) {
      const list = badgesByUser.get(ub.userId) || [];
      list.push(ub);
      badgesByUser.set(ub.userId, list);
    }
    const classNamesByUser = new Map<string, string[]>();
    for (const e of enrollments) {
      const list = classNamesByUser.get(e.userId) || [];
      const name = classNameById.get(e.classId);
      if (name) list.push(name);
      classNamesByUser.set(e.userId, list);
    }

    const studentsList = students.map((s) => ({
      ...s,
      classNames: classNamesByUser.get(s.id) || [],
      badges: (badgesByUser.get(s.id) || []).map((ub) => ({ badge: badgeMap.get(ub.badgeId) || null })),
    }));

    return NextResponse.json({ students: studentsList }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
