import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const classes = await prisma.schoolClass.findMany({
      where: user.role === "TEACHER" ? { teacherId: user.id } : {},
      select: { id: true, name: true },
    });
    const classIds = classes.map((c) => c.id);
    const classNameMap = new Map(classes.map((c) => [c.id, c.name]));

    const enrollments = classIds.length
      ? await prisma.classEnrollment.findMany({ where: { classId: { in: classIds }, status: "APPROVED" }, select: { classId: true, userId: true } })
      : [];
    const studentIds = [...new Set(enrollments.map((e) => e.userId))];

    const [students, userBadges, submissions] = await Promise.all([
      prisma.user.findMany({
        where: { id: { in: studentIds }, role: "STUDENT" },
        select: { id: true, name: true, email: true, avatarUrl: true, cvUrl: true },
      }),
      prisma.userBadge.findMany({ where: { userId: { in: studentIds } } }),
      prisma.submission.findMany({
        where: { userId: { in: studentIds } },
        select: { id: true, userId: true, examId: true, score: true, totalScore: true, status: true },
      }),
    ]);
    const badgeIds = [...new Set(userBadges.map((ub) => ub.badgeId))];
    const examIds = [...new Set(submissions.map((s) => s.examId))];
    const [badges, exams] = await Promise.all([
      prisma.badge.findMany({ where: { id: { in: badgeIds } } }),
      prisma.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true } }),
    ]);
    const badgeMap = new Map(badges.map((b) => [b.id, b]));
    const examMap = new Map(exams.map((e) => [e.id, e]));

    const badgesByUser = new Map<string, typeof userBadges>();
    for (const ub of userBadges) {
      const list = badgesByUser.get(ub.userId) ?? [];
      list.push(ub);
      badgesByUser.set(ub.userId, list);
    }
    const submissionsByUser = new Map<string, typeof submissions>();
    for (const s of submissions) {
      const list = submissionsByUser.get(s.userId) ?? [];
      list.push(s);
      submissionsByUser.set(s.userId, list);
    }

    const classNamesByUser = new Map<string, string[]>();
    for (const e of enrollments) {
      const list = classNamesByUser.get(e.userId) ?? [];
      const name = classNameMap.get(e.classId);
      if (name) list.push(name);
      classNamesByUser.set(e.userId, list);
    }

    const result = students.map((student) => ({
      ...student,
      badges: (badgesByUser.get(student.id) ?? []).map((ub) => ({ ...ub, badge: badgeMap.get(ub.badgeId) ?? null })),
      submissions: (submissionsByUser.get(student.id) ?? []).map((s) => ({ ...s, exam: examMap.get(s.examId) ?? null })),
      classNames: classNamesByUser.get(student.id) ?? [],
    }));

    return NextResponse.json({ students: result }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
