import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

export async function GET() {
  try {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { userId, role, isActive } = await request.json();
    if (typeof userId !== "string" || (role !== undefined && !["ADMIN", "TEACHER", "STUDENT"].includes(role)) || (isActive !== undefined && typeof isActive !== "boolean")) return NextResponse.json({ error: "Invalid user update" }, { status: 400 });
    if (userId === admin.id && (role !== undefined && role !== "ADMIN" || isActive === false)) return NextResponse.json({ error: "You cannot remove your own admin access" }, { status: 400 });

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { ...(role !== undefined ? { role } : {}), ...(isActive !== undefined ? { isActive } : {}) },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });
    await writeAuditLog(admin.id, "USER_UPDATED", userId, JSON.stringify({ role, isActive }));

    return NextResponse.json({ message: "User updated successfully", user: updatedUser }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (admin.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 });
    }
    if (userId === admin.id) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });

    // MongoDB : pas de suppression en cascade. On nettoie les donnees liees.
    const submissions = await prisma.submission.findMany({ where: { userId }, select: { id: true } });
    const submissionIds = submissions.map((s) => s.id);
    const proctoringReports = submissionIds.length
      ? await prisma.proctoringReport.findMany({ where: { submissionId: { in: submissionIds } }, select: { id: true } })
      : [];
    await prisma.$transaction([
      prisma.proctoringReport.deleteMany({ where: { id: { in: proctoringReports.map((r) => r.id) } } }),
      prisma.answer.deleteMany({ where: { submissionId: { in: submissionIds } } }),
      prisma.submission.deleteMany({ where: { userId } }),
      prisma.classEnrollment.deleteMany({ where: { userId } }),
      prisma.userBadge.deleteMany({ where: { userId } }),
      prisma.certificate.deleteMany({ where: { userId } }),
      prisma.auditLog.updateMany({ where: { actorId: userId }, data: { actorId: null } }),
      prisma.user.delete({ where: { id: userId } }),
    ]);
    await writeAuditLog(admin.id, "USER_DELETED", userId);

    return NextResponse.json({ message: "User deleted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
