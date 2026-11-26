import { getCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCertificatePdf } from "@/lib/certificate-pdf";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "STUDENT") return Response.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const certificate = await prisma.certificate.findFirst({ where: { id, userId: user.id } });
    if (!certificate) return Response.json({ error: "Certificate not found" }, { status: 404 });
    const student = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } });
    const pdf = createCertificatePdf({
      studentName: student?.name ?? "",
      certificateTitle: certificate.examTitle,
      description: certificate.description,
      issuerName: certificate.issuerName,
      issuedAt: certificate.issuedAt,
      code: certificate.code,
    });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="certificate-${certificate.code}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Could not create certificate PDF" }, { status: 500 });
  }
}
