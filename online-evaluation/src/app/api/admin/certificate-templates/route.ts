import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const templates = await prisma.certificateTemplate.findMany({ orderBy: { title: "asc" } });
    return NextResponse.json({ templates }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "ADMIN" && user.role !== "TEACHER") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const issuerName = typeof body.issuerName === "string" ? body.issuerName.trim() : "";

    if (title.length < 3) {
      return NextResponse.json({ error: "Certificate title must be at least 3 characters" }, { status: 400 });
    }

    const template = await prisma.certificateTemplate.create({
      data: {
        title,
        description: description || null,
        issuerName: issuerName || null,
      },
    });

    return NextResponse.json({ template }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "A certificate template with this title may already exist" }, { status: 400 });
  }
}
