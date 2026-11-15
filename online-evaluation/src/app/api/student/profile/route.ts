import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (currentUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const badges = await prisma.userBadge.findMany({
      where: { userId: currentUser.id },
      include: { badge: true },
    });

    const certificates = await prisma.certificate.findMany({
      where: { userId: currentUser.id },
      orderBy: { issuedAt: "desc" },
    });

    const submissions = await prisma.submission.findMany({
      where: { userId: currentUser.id },
      include: { exam: true },
    });

    const user = await prisma.user.findUnique({ where: { id: currentUser.id }, select: { name: true, email: true, avatarUrl: true } });

    return NextResponse.json({ user, badges, certificates, submissions }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const current = await getCurrentUser();
    if (!current) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (current.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length < 2 || name.length > 100) return NextResponse.json({ error: "Name must be between 2 and 100 characters" }, { status: 400 });
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailOwner && emailOwner.id !== current.id) return NextResponse.json({ error: "That email address is already in use" }, { status: 409 });
    if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
      if (body.newPassword.length < 8 || typeof body.currentPassword !== "string") return NextResponse.json({ error: "Enter your current password and a new password of at least 8 characters" }, { status: 400 });
      const record = await prisma.user.findUnique({ where: { id: current.id }, select: { password: true } });
      if (!record || !(await bcrypt.compare(body.currentPassword, record.password))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim().slice(0, 1000) : null;
    const user = await prisma.user.update({ where: { id: current.id }, data: { name, email, avatarUrl, ...(body.newPassword ? { password: await bcrypt.hash(body.newPassword, 10) } : {}) }, select: { name: true, email: true, avatarUrl: true } });
    return NextResponse.json({ user }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
