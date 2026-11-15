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

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const requestedId = new URL(request.url).searchParams.get('userId');
  if (requestedId && (user.role === 'TEACHER' || user.role === 'ADMIN')) {
    if (user.role === 'TEACHER') {
      const enrollment = await prisma.classEnrollment.findFirst({ where: { userId: requestedId, status: 'APPROVED', schoolClass: { teacherId: user.id } }, select: { id: true } });
      if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else if (user.role !== 'STUDENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const ownerId = requestedId && (user.role === 'TEACHER' || user.role === 'ADMIN') ? requestedId : user.id;

  const record = await prisma.user.findUnique({ where: { id: ownerId }, select: { cvUrl: true } });
  if (!record?.cvUrl) return NextResponse.json({ cvUrl: null }, { status: 200 });
  if (new URL(request.url).searchParams.get('meta') === '1') return NextResponse.json({ cvUrl: '/api/student/cv' }, { status: 200 });
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

  await mkdir(uploadDir, { recursive: true });
  const filename = `${user.id}-${randomUUID()}.pdf`;
  const relativePath = path.join('uploads', 'cvs', filename);
  const targetFilePath = path.join(uploadDir, filename);

  const previous = await prisma.user.findUnique({ where: { id: user.id }, select: { cvUrl: true } });

  await writeFile(targetFilePath, bytes);
  try {
    await prisma.user.update({ where: { id: user.id }, data: { cvUrl: relativePath, cvData } });
  } catch (dbErr) {
    await unlink(targetFilePath).catch(() => undefined);
    throw dbErr;
  }

  if (previous?.cvUrl) {
    const oldPath = path.resolve(process.cwd(), previous.cvUrl);
    if (oldPath.startsWith(path.resolve(uploadDir) + path.sep)) {
      await unlink(oldPath).catch(() => undefined);
    }
  }

  return NextResponse.json({ success: true, cvUrl: '/api/student/cv', warning });
}
