import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";

const defaults: Record<string, string> = { platformName: "Online Evaluation", supportEmail: "", maintenanceMode: "false" };

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const rows = await prisma.systemSetting.findMany();
    const settings = { ...defaults, ...Object.fromEntries(rows.map(({ key, value }) => [key, value])) };
    return NextResponse.json({ settings }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}

export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json();
    const entries: [string, string][] = [];
    if (body.platformName !== undefined) {
      if (typeof body.platformName !== "string" || body.platformName.trim().length < 2 || body.platformName.trim().length > 80) return NextResponse.json({ error: "Platform name must be 2 to 80 characters" }, { status: 400 });
      entries.push(["platformName", body.platformName.trim()]);
    }
    if (body.supportEmail !== undefined) {
      if (typeof body.supportEmail !== "string" || (body.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.supportEmail))) return NextResponse.json({ error: "Enter a valid support email" }, { status: 400 });
      entries.push(["supportEmail", body.supportEmail.trim()]);
    }
    if (body.maintenanceMode !== undefined) {
      if (typeof body.maintenanceMode !== "boolean") return NextResponse.json({ error: "Maintenance mode must be a boolean" }, { status: 400 });
      entries.push(["maintenanceMode", String(body.maintenanceMode)]);
    }
    if (!entries.length) return NextResponse.json({ error: "No settings provided" }, { status: 400 });
    for (const [key, value] of entries) {
      await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await writeAuditLog(user.id, "PLATFORM_SETTINGS_UPDATED", "SystemSetting", entries.map(([key]) => key).join(", "));
    return NextResponse.json({ message: "Settings updated" }, { status: 200 });
  } catch { return NextResponse.json({ error: "Internal server error" }, { status: 500 }); }
}
