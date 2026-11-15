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
      include: {
        enrollments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, avatarUrl: true, cvUrl: true,
                badges: { include: { badge: true } },
                submissions: { select: { id: true, score: true, totalScore: true, status: true, exam: { select: { title: true } } } }
              }
            }
          }
        }
      }
    });

    const studentsMap = new Map();
    for (const c of classes) {
      for (const e of c.enrollments) {
        if (e.user && e.status === "APPROVED") {
          studentsMap.set(e.user.id, {
            ...e.user,
            classNames: [...(studentsMap.get(e.user.id)?.classNames || []), c.name]
          });
        }
      }
    }

    return NextResponse.json({ students: Array.from(studentsMap.values()) }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
