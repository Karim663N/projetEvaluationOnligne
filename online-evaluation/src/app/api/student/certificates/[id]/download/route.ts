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
    const rows = await prisma.$queryRaw<Array<{ id: string; examTitle: string; description: string | null; issuerName: string | null; issuedAt: Date; code: string; studentName: string }>>`
      SELECT c."id", c."examTitle", c."description", c."issuerName", c."issuedAt", c."code", u."name" AS "studentName"
      FROM "Certificate" c INNER JOIN "User" u ON u."id" = c."userId"
      WHERE c."id" = ${id} AND c."userId" = ${user.id} LIMIT 1
    `;
    const certificate = rows[0];
    if (!certificate) return Response.json({ error: "Certificate not found" }, { status: 404 });
    const pdf = createCertificatePdf({
      studentName: certificate.studentName,
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
