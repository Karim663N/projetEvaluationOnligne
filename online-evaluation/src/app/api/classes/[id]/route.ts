import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const body = await request.json();
    if (typeof body.enrollmentId !== "string") return NextResponse.json({ error: "Enrollment ID is required" }, { status: 400 });
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id }, select: { teacherId: true } });
    if (!schoolClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    if (user.role === "TEACHER" && schoolClass.teacherId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const removed = await prisma.classEnrollment.deleteMany({ where: { id: body.enrollmentId, classId: id } });
    if (!removed.count) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
    await writeAuditLog(user.id, "CLASS_ENROLLMENT_REMOVED", id, body.enrollmentId);
    return NextResponse.json({ message: "Student removed from class" }, { status: 200 });
  } catch { return NextResponse.json({ error: "Could not remove student from class" }, { status: 500 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    if (user.role === "STUDENT") {
      const schoolClass = await prisma.schoolClass.findUnique({ where: { id }, select: { id: true, joinCode: true } });
      if (!schoolClass || body.joinCode !== schoolClass.joinCode) return NextResponse.json({ error: "Invalid join code" }, { status: 403 });
      const current = await prisma.classEnrollment.findUnique({ where: { classId_userId: { classId: id, userId: user.id } } });
      if (current?.status === "APPROVED") return NextResponse.json({ enrollment: current }, { status: 200 });
      const enrollment = await prisma.classEnrollment.upsert({
        where: { classId_userId: { classId: id, userId: user.id } },
        create: { classId: id, userId: user.id, status: "PENDING" },
        update: { status: "PENDING" },
      });
      return NextResponse.json({ enrollment }, { status: 201 });
    }
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id }, select: { id: true, teacherId: true } });
    if (!schoolClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    if (user.role === "TEACHER" && schoolClass.teacherId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (typeof body.enrollmentId === "string" && ["APPROVED", "REJECTED"].includes(body.status)) {
      const result = await prisma.classEnrollment.updateMany({
        where: { id: body.enrollmentId, classId: id },
        data: { status: body.status },
      });
      if (!result.count) return NextResponse.json({ error: "Enrollment not found" }, { status: 404 });
      await writeAuditLog(user.id, "CLASS_ENROLLMENT_UPDATED", id, `${body.enrollmentId}:${body.status}`);
      return NextResponse.json({ message: "Enrollment updated" }, { status: 200 });
    }
    const data: { name?: string; description?: string | null; teacherId?: string | null } = {};
    if (typeof body.name === "string" && body.name.trim().length >= 2) data.name = body.name.trim();
    if (typeof body.description === "string" || body.description === null) data.description = body.description;
    if (user.role === "ADMIN" && (typeof body.teacherId === "string" || body.teacherId === null)) {
      if (body.teacherId) {
        const teacher = await prisma.user.findUnique({ where: { id: body.teacherId }, select: { role: true, isActive: true } });
        if (!teacher || teacher.role !== "TEACHER" || !teacher.isActive) return NextResponse.json({ error: "Active teacher not found" }, { status: 400 });
      }
      data.teacherId = body.teacherId;
    }
    if (Object.keys(data).length) {
      const updated = await prisma.schoolClass.update({ where: { id }, data });
      await writeAuditLog(user.id, "CLASS_UPDATED", id, JSON.stringify(data));
      return NextResponse.json({ schoolClass: updated }, { status: 200 });
    }
    return NextResponse.json({ error: "Enrollment ID and valid status are required" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
