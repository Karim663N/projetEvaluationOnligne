import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const [students, teachers, publishedExams, submissions] = await Promise.all([
      prisma.user.count({ where: { role: "STUDENT", isActive: true } }),
      prisma.user.count({ where: { role: "TEACHER", isActive: true } }),
      prisma.exam.count({ where: { published: true } }),
      prisma.submission.count({ where: { status: { not: "IN_PROGRESS" } } }),
    ]);
    return NextResponse.json({ students, teachers, publishedExams, submissions }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
