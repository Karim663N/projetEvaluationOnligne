import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const formats = [
  { mime: "image/jpeg", ext: ".jpg", matches: (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: ".png", matches: (b: Buffer) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  { mime: "image/webp", ext: ".webp", matches: (b: Buffer) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
  { mime: "image/gif", ext: ".gif", matches: (b: Buffer) => ["GIF87a", "GIF89a"].includes(b.toString("ascii", 0, 6)) },
];

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "TEACHER" && user.role !== "ADMIN") return NextResponse.json({ error: "Only teachers and administrators can upload question images" }, { status: 403 });

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") return NextResponse.json({ error: "Choose an image file" }, { status: 400 });
    if (file.size < 1 || file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Images must be 5 MB or smaller" }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const format = formats.find((candidate) => candidate.mime === file.type && candidate.matches(buffer));
    if (!format) return NextResponse.json({ error: "Use a valid JPEG, PNG, WebP, or GIF image" }, { status: 415 });

    const filename = `${randomUUID()}${format.ext}`;
    const uploadDirectory = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, filename), buffer, { flag: "wx" });
    return NextResponse.json({ url: `/api/uploads/images/${filename}` }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Image upload failed" }, { status: 500 });
  }
}
