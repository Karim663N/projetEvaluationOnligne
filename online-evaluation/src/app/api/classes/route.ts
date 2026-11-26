import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

// MongoDB : pas de relations Prisma. Les jointures sont faites manuellement
// puis assemblees dans la forme JSON attendue par le frontend.

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let classIdsFilter: string[] | null = null;
    if (user.role === "STUDENT") {
      const myEnrollments = await prisma.classEnrollment.findMany({
        where: { userId: user.id },
        select: { classId: true },
      });
      classIdsFilter = myEnrollments.map((e) => e.classId);
      if (classIdsFilter.length === 0) return NextResponse.json({ classes: [] }, { status: 200 });
    }

    const classes = await prisma.schoolClass.findMany({
      where:
        user.role === "ADMIN"
          ? classIdsFilter ? { id: { in: classIdsFilter } } : {}
          : user.role === "TEACHER"
            ? { teacherId: user.id }
            : { id: { in: classIdsFilter! } },
      orderBy: { createdAt: "desc" },
    });
    const ids = classes.map((c) => c.id);
    if (ids.length === 0) return NextResponse.json({ classes: [] }, { status: 200 });

    const isStaff = user.role === "TEACHER" || user.role === "ADMIN";
    const [enrollments, exams, teachers] = await Promise.all([
      prisma.classEnrollment.findMany({
        where: isStaff ? { classId: { in: ids } } : { classId: { in: ids }, userId: user.id },
        select: { id: true, classId: true, userId: true, status: true },
      }),
      prisma.exam.findMany({ where: { classId: { in: ids } }, select: { classId: true } }),
      prisma.user.findMany({
        where: { id: { in: classes.map((c) => c.teacherId).filter((v): v is string => Boolean(v)) } },
        select: { id: true, name: true, email: true },
      }),
    ]);

    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const examCounts = new Map<string, number>();
    for (const e of exams) if (e.classId) examCounts.set(e.classId, (examCounts.get(e.classId) ?? 0) + 1);

    let userMap = new Map<string, { id: string; name: string; email: string }>();
    if (isStaff) {
      const users = await prisma.user.findMany({
        where: { id: { in: enrollments.map((e) => e.userId) } },
        select: { id: true, name: true, email: true },
      });
      userMap = new Map(users.map((u) => [u.id, u]));
    }

    const enrollmentsByClass = new Map<string, typeof enrollments>();
    for (const e of enrollments) {
      const list = enrollmentsByClass.get(e.classId) ?? [];
      list.push(e);
      enrollmentsByClass.set(e.classId, list);
    }

    const result = classes.map((c) => ({
      ...c,
      teacher: c.teacherId ? teacherMap.get(c.teacherId) ?? null : null,
      _count: { enrollments: enrollmentsByClass.get(c.id)?.length ?? 0, exams: examCounts.get(c.id) ?? 0 },
      enrollments: (enrollmentsByClass.get(c.id) ?? []).map((e) =>
        isStaff
          ? { id: e.id, status: e.status, user: userMap.get(e.userId) ?? null }
          : { id: e.id, status: e.status }
      ),
    }));

    return NextResponse.json({ classes: result }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await request.json();
    if (user.role === "STUDENT") {
      const joinCode = typeof body.joinCode === "string" ? body.joinCode.trim() : "";
      if (!joinCode) return NextResponse.json({ error: "Class code is required" }, { status: 400 });
      const schoolClass = await prisma.schoolClass.findUnique({ where: { joinCode } });
      if (!schoolClass) return NextResponse.json({ error: "Class code not found" }, { status: 404 });
      const current = await prisma.classEnrollment.findFirst({ where: { classId: schoolClass.id, userId: user.id } });
      if (current?.status === "APPROVED") return NextResponse.json({ enrollment: current }, { status: 200 });
      const enrollment = current
        ? await prisma.classEnrollment.update({ where: { id: current.id }, data: { status: "PENDING" } })
        : await prisma.classEnrollment.create({ data: { classId: schoolClass.id, userId: user.id, status: "PENDING" } });
      await writeAuditLog(user.id, "CLASS_JOIN_REQUESTED", schoolClass.id);
      return NextResponse.json({ enrollment }, { status: 201 });
    }
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2) return NextResponse.json({ error: "Class name must be at least 2 characters" }, { status: 400 });
    const teacherId = user.role === "TEACHER" ? user.id : typeof body.teacherId === "string" ? body.teacherId : null;
    if (teacherId) {
      const teacher = await prisma.user.findUnique({ where: { id: teacherId }, select: { id: true, role: true, isActive: true } });
      if (!teacher || teacher.role !== "TEACHER" || !teacher.isActive) return NextResponse.json({ error: "Active teacher not found" }, { status: 400 });
    }
    const schoolClass = await prisma.schoolClass.create({
      data: { name, description: typeof body.description === "string" ? body.description.trim() : null, joinCode: randomBytes(4).toString("hex").toUpperCase(), teacherId },
    });
    await writeAuditLog(user.id, "CLASS_CREATED", schoolClass.id, schoolClass.name);
    return NextResponse.json({ schoolClass }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
