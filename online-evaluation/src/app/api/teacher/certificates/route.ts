import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  try {
    const teacher = await getCurrentUser();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (teacher.role !== "TEACHER") return NextResponse.json({ error: "Only teachers can issue certificates" }, { status: 403 });

    const body = await request.json();
    const classId = typeof body.classId === "string" ? body.classId : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    const examTitle = typeof body.examTitle === "string" ? body.examTitle.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const issuerName = typeof body.issuerName === "string" ? body.issuerName.trim() : "";
    const signatureDataUrl = typeof body.signatureDataUrl === "string" && body.signatureDataUrl ? body.signatureDataUrl : null;

    if (signatureDataUrl && (!signatureDataUrl.startsWith("data:image/jpeg;base64,") || signatureDataUrl.length > 500_000)) {
      return NextResponse.json({ error: "Invalid signature image" }, { status: 400 });
    }

    if (!classId && !userId) return NextResponse.json({ error: "Choose a class or a specific student" }, { status: 400 });
    if (examTitle.length < 3 || examTitle.length > 120) return NextResponse.json({ error: "Certificate title must be between 3 and 120 characters" }, { status: 400 });
    if (description.length > 260) return NextResponse.json({ error: "Certificate text must be 260 characters or fewer" }, { status: 400 });
    if (issuerName.length < 2 || issuerName.length > 100) return NextResponse.json({ error: "Issuer name must be between 2 and 100 characters" }, { status: 400 });

    let studentIds: string[] = [];

    if (userId) {
      // Verify student is enrolled in one of teacher's classes
      const teacherClasses = await prisma.schoolClass.findMany({ where: { teacherId: teacher.id }, select: { id: true } });
      const teacherClassIds = teacherClasses.map((c) => c.id);
      const enrollment = await prisma.classEnrollment.findFirst({
        where: { userId, status: "APPROVED", classId: { in: teacherClassIds } },
        select: { userId: true },
      });
      if (!enrollment) return NextResponse.json({ error: "Student must be enrolled in one of your classes" }, { status: 403 });
      studentIds = [userId];
    } else {
      const schoolClass = await prisma.schoolClass.findFirst({ where: { id: classId, teacherId: teacher.id }, select: { id: true } });
      if (!schoolClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });
      const enrollments = await prisma.classEnrollment.findMany({
        where: { classId, status: "APPROVED" },
        select: { userId: true },
      });
      const candidateIds = enrollments.map((e) => e.userId);
      const eligibleUsers = candidateIds.length
        ? await prisma.user.findMany({ where: { id: { in: candidateIds }, role: "STUDENT", isActive: true }, select: { id: true } })
        : [];
      studentIds = eligibleUsers.map((u) => u.id);
    }

    if (studentIds.length === 0) return NextResponse.json({ error: "No eligible students found for certificate issuance" }, { status: 400 });

    for (const uid of studentIds) {
      await prisma.certificate.create({
        data: {
          userId: uid,
          examTitle,
          description: description || null,
          issuerName,
          signatureDataUrl,
          code: randomUUID(),
        },
      });
    }

    await writeAuditLog(teacher.id, "CERTIFICATES_ISSUED", classId || userId, `${studentIds.length} certificate(s): ${examTitle}`);
    return NextResponse.json({ count: studentIds.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not issue certificates" }, { status: 500 });
  }
}
