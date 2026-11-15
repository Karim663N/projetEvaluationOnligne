import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "reset-password"), 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const { email, token, newPassword } = await request.json();
    if (!email || !token || !newPassword) {
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    }
    if (typeof newPassword !== "string" || newPassword.length < 6 || newPassword.length > 128) {
      return NextResponse.json({ error: "Password must be between 6 and 128 characters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.resetToken !== token || !user.resetTokenExp || user.resetTokenExp < new Date()) {
      return NextResponse.json({ error: "Invalid or expired reset code" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { email },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return NextResponse.json({ message: "Password updated successfully" });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
