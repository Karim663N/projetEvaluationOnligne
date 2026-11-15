import { prisma } from "@/lib/prisma";

export async function writeAuditLog(actorId: string, action: string, target?: string, details?: string) {
  await prisma.auditLog.create({ data: { actorId, action, target: target || null, details: details || null } });
}
