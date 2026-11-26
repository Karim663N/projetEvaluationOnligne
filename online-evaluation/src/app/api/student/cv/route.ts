import { randomUUID } from 'crypto';
import { mkdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { extractPdfText } from '@/lib/pdf';

export const runtime = 'nodejs';

const uploadDir = path.join(process.cwd(), 'uploads', 'cvs');
const maxSize = 10 * 1024 * 1024;
// Marqueur : le PDF est stocke dans MongoDB (champ cvFile), pas sur le disque.
const CV_STORED_FLAG = '/api/student/cv';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requestedId = new URL(request.url).searchParams.get('userId');
  if (requestedId && (user.role === 'TEACHER' || user.role === 'ADMIN')) {
    if (user.role === 'TEACHER') {
      const teacherClasses = await prisma.schoolClass.findMany({ where: { teacherId: user.id }, select: { id: true } });
      const teacherClassIds = teacherClasses.map((c) => c.id);
      const ok = await prisma.classEnrollment.findFirst({ where: { userId: requestedId, status: 'APPROVED', classId: { in: teacherClassIds } }, select: { id: true } });
      if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (user.role !== 'STUDENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const ownerId = requestedId && (user.role === 'TEACHER' || user.role === 'ADMIN') ? requestedId : user.id;

  const record = await prisma.user.findUnique({ where: { id: ownerId }, select: { cvUrl: true, cvFile: true } });
  if (!record?.cvUrl && !record?.cvFile) return NextResponse.json({ cvUrl: null }, { status: 200 });
  if (new URL(request.url).searchParams.get('meta') === '1') return NextResponse.json({ cvUrl: CV_STORED_FLAG }, { status: 200 });

  // Priorite : PDF stocke en base MongoDB (fonctionne en ligne).
  if (record.cvFile) {
    return new NextResponse(new Uint8Array(record.cvFile), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' } });
  }

  // Repli : ancien fichier sur disque (uploads/cvs/...).
  if (!record.cvUrl || record.cvUrl === CV_STORED_FLAG) return NextResponse.json({ error: 'CV not found' }, { status: 404 });
  const filePath = path.resolve(process.cwd(), record.cvUrl);
  if (!filePath.startsWith(path.resolve(uploadDir) + path.sep)) return NextResponse.json({ error: 'Invalid CV path' }, { status: 500 });
  try {
    const file = await readFile(filePath);
    return new NextResponse(file, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'CV not found' }, { status: 404 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'STUDENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const formData = await request.formData();
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 });
  if (file.size > maxSize || (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) return NextResponse.json({ error: 'CV must be a PDF smaller than 10MB' }, { status: 400 });

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'Invalid PDF file' }, { status: 400 });

  let cvData = '';
  let warning: string | undefined = undefined;
  try {
    cvData = await extractPdfText(bytes);
    if (!cvData) {
      warning = 'no_text_extracted';
    }
  } catch (e) {
    console.error('Error parsing uploaded CV text:', e);
    return NextResponse.json({ error: 'Impossible d\'analyser le fichier PDF. Veuillez vérifier le fichier.' }, { status: 400 });
  }

  const previous = await prisma.user.findUnique({ where: { id: user.id }, select: { cvUrl: true } });

  // Le PDF est conserve dans MongoDB (cvFile) : disponible meme si l'app est hebergee en ligne.
  await prisma.user.update({
    where: { id: user.id },
    data: { cvUrl: CV_STORED_FLAG, cvData, cvFile: bytes },
  });

  // Miroir disque best-effort (utile en developpement local, ignore si impossible).
  try {
    await mkdir(uploadDir, { recursive: true });
    const filename = `${user.id}-${randomUUID()}.pdf`;
    await writeFile(path.join(uploadDir, filename), bytes);
  } catch {
    // pas critique : la source de verite est MongoDB
  }

  // Nettoie un ancien fichier disque s'il existait.
  if (previous?.cvUrl && previous.cvUrl !== CV_STORED_FLAG) {
    const oldPath = path.resolve(process.cwd(), previous.cvUrl);
    if (oldPath.startsWith(path.resolve(uploadDir) + path.sep)) {
      await unlink(oldPath).catch(() => undefined);
    }
  }

  return NextResponse.json({ success: true, cvUrl: CV_STORED_FLAG, warning });
}
