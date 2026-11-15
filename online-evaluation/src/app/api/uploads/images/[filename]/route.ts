import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const allowedFile = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i;
const contentTypes: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(_request: Request, { params }: { params: Promise<{ filename: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { filename } = await params;
    if (!allowedFile.test(filename)) return NextResponse.json({ error: "Image not found" }, { status: 404 });
    const buffer = await readFile(path.join(process.cwd(), "public", "uploads", filename));
    const ext = path.extname(filename).slice(1).toLowerCase();
    return new NextResponse(buffer, { status: 200, headers: { "Content-Type": contentTypes[ext], "Content-Length": String(buffer.byteLength), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }
}
