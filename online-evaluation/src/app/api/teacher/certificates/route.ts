import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { randomUUID } from "node:crypto";

export async function POST(request: Request) {
  try {
    const teacher = await getCurrentUser();
    if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (teacher.role !== "TEACHER") return NextResponse.json({ error: "Only teachers can issue class certificates" }, { status: 403 });

    const body = await request.json();
    const classId = typeof body.classId === "string" ? body.classId : "";
    const examTitle = typeof body.examTitle === "string" ? body.examTitle.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const issuerName = typeof body.issuerName === "string" ? body.issuerName.trim() : "";
    if (!classId) return NextResponse.json({ error: "Choose a class" }, { status: 400 });
    if (examTitle.length < 3 || examTitle.length > 120) return NextResponse.json({ error: "Certificate title must be between 3 and 120 characters" }, { status: 400 });
    if (description.length > 260) return NextResponse.json({ error: "Certificate text must be 260 characters or fewer" }, { status: 400 });
    if (issuerName.length < 2 || issuerName.length > 100) return NextResponse.json({ error: "Issuer name must be between 2 and 100 characters" }, { status: 400 });

    const schoolClass = await prisma.schoolClass.findFirst({ where: { id: classId, teacherId: teacher.id }, select: { id: true } });
    if (!schoolClass) return NextResponse.json({ error: "Class not found" }, { status: 404 });
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId, status: "APPROVED" },
      select: { userId: true },
    });
    // Filtre "user.role = STUDENT AND isActive" applique apres coup (pas de jointure MongoDB).
    const studentIds = enrollments.map((e) => e.userId);
    const activeStudents = studentIds.length
      ? await prisma.user.findMany({ where: { id: { in: studentIds }, role: "STUDENT", isActive: true }, select: { id: true } })
      : [];
    if (activeStudents.length === 0) return NextResponse.json({ error: "This class has no active approved students" }, { status: 400 });

    for (const { id: userId } of activeStudents) {
      await prisma.certificate.create({
        data: { userId, examTitle, description: description || null, issuerName, code: randomUUID() },
      });
    }
    await writeAuditLog(teacher.id, "CLASS_CERTIFICATES_ISSUED", classId, `${activeStudents.length} certificate(s): ${examTitle}`);
    return NextResponse.json({ count: activeStudents.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not issue certificates" }, { status: 500 });
  }
}
