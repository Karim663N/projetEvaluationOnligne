import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be configured in production");
const JWT_SECRET = new TextEncoder().encode(jwtSecret || "dev-only-change-this-secret-before-deploying-1234567890");

export async function signToken(payload: { userId: string; email: string; role: string }) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as { userId: string; email: string; role: string };
  } catch (error) {
    return null;
  }
}

export const AUTH_COOKIE_NAME = "token";
const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24; // 24h, matches JWT expiry

export function setAuthCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: AUTH_COOKIE_MAX_AGE,
    path: "/",
  });
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: new Date(0),
    path: "/",
  });
}

export async function getCurrentUser() {
  const token = (await cookies()).get("token")?.value;
  const payload = token ? await verifyToken(token) : null;
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
  if (!user?.isActive || !["ADMIN", "TEACHER", "STUDENT"].includes(user.role)) return null;
  if (user.role !== "ADMIN") {
    const maintenance = await prisma.systemSetting.findUnique({ where: { key: "maintenanceMode" }, select: { value: true } });
    if (maintenance?.value === "true") {
      const activeAttempt = await prisma.submission.findFirst({ where: { userId: user.id, status: "IN_PROGRESS" }, select: { id: true } });
      if (!activeAttempt) return null;
    }
  }
  return user;
}
