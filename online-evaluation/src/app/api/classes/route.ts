import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

async function serializeClasses(classes: Array<Record<string, unknown> & { id: string; teacherId: string | null }>, viewer: { id: string; role: string }) {
  const classIds = classes.map((c) => c.id);
  const isStaff = viewer.role === "TEACHER" || viewer.role === "ADMIN";

  const [enrollments, exams, teachers] = await Promise.all([
    classIds.length
      ? prisma.classEnrollment.findMany({ where: { classId: { in: classIds } } })
      : Promise.resolve([]),
    classIds.length
      ? prisma.exam.findMany({ where: { classId: { in: classIds } }, select: { classId: true } })
      : Promise.resolve([]),
    prisma.user.findMany({
      where: { id: { in: classes.map((c) => c.teacherId).filter((x): x is string => Boolean(x)) } },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const enrollmentUsers = isStaff && enrollments.length
    ? await prisma.user.findMany({
        where: { id: { in: enrollments.map((e) => e.userId) } },
        select: { id: true, name: true, email: true },
      })
    : [];

  const teacherMap = new Map(teachers.map((u) => [u.id, u]));
  const userMap = new Map(enrollmentUsers.map((u) => [u.id, u]));
  const enrollmentsByClass = new Map<string, typeof enrollments>();
  for (const e of enrollments) {
    const list = enrollmentsByClass.get(e.classId) || [];
    list.push(e);
    enrollmentsByClass.set(e.classId, list);
  }
  const examCountByClass = new Map<string, number>();
  for (const ex of exams) examCountByClass.set(ex.classId || "", (examCountByClass.get(ex.classId || "") || 0) + 1);

  return classes.map((c) => {
    const classEnrollments = enrollmentsByClass.get(c.id) || [];
    return {
      ...c,
      teacher: c.teacherId ? teacherMap.get(c.teacherId) || null : null,
      _count: { enrollments: classEnrollments.length, exams: examCountByClass.get(c.id) || 0 },
      enrollments: isStaff
        ? classEnrollments.map((e) => ({ ...e, user: userMap.get(e.userId) || null }))
        : classEnrollments.filter((e) => e.userId === viewer.id).map((e) => ({ status: e.status })),
    };
  });
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let classes;
    if (user.role === "STUDENT") {
      const myEnrollments = await prisma.classEnrollment.findMany({ where: { userId: user.id }, select: { classId: true } });
      const classIds = myEnrollments.map((e) => e.classId);
      classes = await prisma.schoolClass.findMany({ where: { id: { in: classIds } }, orderBy: { createdAt: "desc" } });
    } else {
      classes = await prisma.schoolClass.findMany({
        where: user.role === "TEACHER" ? { teacherId: user.id } : {},
        orderBy: { createdAt: "desc" },
      });
    }

    const serialized = await serializeClasses(classes, user);
    return NextResponse.json({ classes: serialized }, { status: 200 });
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
