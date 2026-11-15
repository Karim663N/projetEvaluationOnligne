import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Aucun fichier fourni' }, { status: 400 });
    }

    // Validate size (< 5MB) and type
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'Fichier trop volumineux (max 5 Mo)' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Format non supporté (JPEG, PNG, WEBP uniquement)' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.type.split('/')[1] || 'png';
    const filename = `user-${user.id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'profile');

    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, filename);
    await writeFile(filePath, buffer);

    const avatarUrl = `/uploads/profile/${filename}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl },
    });

    return NextResponse.json({ success: true, avatarUrl });
  } catch (err: unknown) {
    const errorObj = err as Error;
    console.error('Avatar upload error:', errorObj);
    return NextResponse.json({ success: false, error: errorObj.message || 'Erreur lors du téléchargement' }, { status: 500 });
  }
}
