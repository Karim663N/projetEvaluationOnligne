 import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
  expectedRole: z.enum(["ADMIN", "TEACHER", "STUDENT"]).optional(),
});

export async function POST(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "login"), 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json({ error: result.error.format() }, { status: 400 });
    }

    const { email, password, expectedRole } = result.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    if (!user.isActive) return NextResponse.json({ error: "This account has been blocked. Contact your administrator." }, { status: 403 });
    if (!["ADMIN", "TEACHER", "STUDENT"].includes(user.role)) return NextResponse.json({ error: "This account role is not supported." }, { status: 403 });
    if (expectedRole && user.role !== expectedRole) {
      return NextResponse.json({ error: `This account is registered as ${user.role.toLowerCase()}. Use the matching portal.` }, { status: 403 });
    }
    if (user.role !== "ADMIN") {
      const maintenance = await prisma.systemSetting.findUnique({ where: { key: "maintenanceMode" }, select: { value: true } });
      if (maintenance?.value === "true") return NextResponse.json({ error: "The platform is temporarily unavailable for maintenance." }, { status: 503 });
    }

    const token = await signToken({ userId: user.id, email: user.email, role: user.role });

    const response = NextResponse.json(
      { message: "Logged in successfully", user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 200 }
    );

    setAuthCookie(response, token);

    return response;
  } catch (err: unknown) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
