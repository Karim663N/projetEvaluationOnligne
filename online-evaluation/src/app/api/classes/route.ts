import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const classes = await prisma.schoolClass.findMany({
      where: user.role === "ADMIN" ? {} : user.role === "TEACHER" ? { teacherId: user.id } : { enrollments: { some: { userId: user.id } } },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { enrollments: true, exams: true } },
        ...(user.role === "TEACHER" || user.role === "ADMIN" ? { enrollments: { include: { user: { select: { id: true, name: true, email: true } } } } } : { enrollments: { where: { userId: user.id }, select: { status: true } } }),
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ classes }, { status: 200 });
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
      const current = await prisma.classEnrollment.findUnique({ where: { classId_userId: { classId: schoolClass.id, userId: user.id } } });
      if (current?.status === "APPROVED") return NextResponse.json({ enrollment: current }, { status: 200 });
      const enrollment = await prisma.classEnrollment.upsert({
        where: { classId_userId: { classId: schoolClass.id, userId: user.id } },
        create: { classId: schoolClass.id, userId: user.id, status: "PENDING" },
        update: { status: "PENDING" },
      });
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
