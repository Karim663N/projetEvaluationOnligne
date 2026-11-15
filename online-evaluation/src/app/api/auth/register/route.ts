import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { signToken, setAuthCookie } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { z } from "zod";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(6),
  role: z.enum(["STUDENT", "TEACHER"]).default("STUDENT"),
});

export async function POST(request: Request) {
  try {
    const limit = rateLimit(clientKey(request, "register"), 10, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } }
      );
    }

    const body = await request.json();
    const result = registerSchema.safeParse(body);

    if (!result.success) {
      console.error("Validation error:", result.error.format());
      return NextResponse.json({ error: result.error.format() }, { status: 400 });
    }

    const { name, email, password, role } = result.data;

    const maintenance = await prisma.systemSetting.findUnique({ where: { key: "maintenanceMode" }, select: { value: true } });
    if (maintenance?.value === "true") return NextResponse.json({ error: "Registration is unavailable during maintenance." }, { status: 503 });

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    const token = await signToken({ userId: user.id, email: user.email, role: user.role });

    const response = NextResponse.json(
      { message: "Registered successfully", user: { id: user.id, name: user.name, email: user.email, role: user.role } },
      { status: 201 }
    );

    setAuthCookie(response, token);

    return response;
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
