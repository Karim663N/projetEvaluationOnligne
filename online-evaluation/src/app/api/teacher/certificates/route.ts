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
      where: { classId, status: "APPROVED", user: { role: "STUDENT", isActive: true } },
      select: { userId: true },
    });
    if (enrollments.length === 0) return NextResponse.json({ error: "This class has no active approved students" }, { status: 400 });

    await prisma.$transaction(enrollments.map(({ userId }) => {
      const id = randomUUID();
      const code = randomUUID();
      return prisma.$executeRaw`INSERT INTO "Certificate" ("id", "userId", "examTitle", "description", "issuerName", "issuedAt", "code") VALUES (${id}, ${userId}, ${examTitle}, ${description || null}, ${issuerName}, CURRENT_TIMESTAMP, ${code})`;
    }));
    await writeAuditLog(teacher.id, "CLASS_CERTIFICATES_ISSUED", classId, `${enrollments.length} certificate(s): ${examTitle}`);
    return NextResponse.json({ count: enrollments.length }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not issue certificates" }, { status: 500 });
  }
}
