import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const profile = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, role: true, avatarUrl: true } });
    return NextResponse.json({ user: profile }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const avatarUrl = typeof body.avatarUrl === "string" && body.avatarUrl.trim() ? body.avatarUrl.trim().slice(0, 1000) : null;

    if (name.length < 2) return NextResponse.json({ error: "Name must be at least 2 characters" }, { status: 400 });

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (emailOwner && emailOwner.id !== user.id) return NextResponse.json({ error: "That email address is already in use" }, { status: 409 });
    if (typeof body.newPassword === "string" && body.newPassword.length > 0) {
      if (body.newPassword.length < 8 || typeof body.currentPassword !== "string") return NextResponse.json({ error: "Enter your current password and a new password of at least 8 characters" }, { status: 400 });
      const record = await prisma.user.findUnique({ where: { id: user.id }, select: { password: true } });
      if (!record || !(await bcrypt.compare(body.currentPassword, record.password))) return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name, email, avatarUrl, ...(body.newPassword ? { password: await bcrypt.hash(body.newPassword, 10) } : {}) },
      select: { id: true, name: true, email: true, role: true, avatarUrl: true }
    });

    return NextResponse.json({ message: "Profile updated successfully", user: updated }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
