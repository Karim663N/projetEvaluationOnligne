import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import path from 'path';
import fs from 'fs/promises';
import { extractPdfText } from '@/lib/pdf';

export const runtime = 'nodejs';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.0-flash-lite',
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function generateWithRetry(contents: string, maxRetries = 3) {
  let lastError: unknown = null;

  for (const model of FALLBACK_MODELS) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
        });
        return response.text || '';
      } catch (err: unknown) {
        lastError = err;
        const errorObj = err as Error & { status?: number };
        const status = errorObj.status || 500;

        if (status === 401 || status === 403 || status === 404) {
          throw err;
        }

        if (attempt === maxRetries) {
          console.warn(`Model ${model} failed after ${maxRetries} attempts, trying fallback...`);
          break;
        }

        const backoffMs = Math.pow(2, attempt) * 1000;
        console.warn(`Attempt ${attempt}/${maxRetries} for model ${model} failed (status ${status}). Retrying in ${backoffMs}ms...`);
        await sleep(backoffMs);
      }
    }
  }

  throw lastError || new Error('All AI models are currently unavailable. Please try again later.');
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== 'STUDENT') {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const studentUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { cvData: true, cvUrl: true },
    });

    if (!studentUser?.cvData && !studentUser?.cvUrl) {
      return NextResponse.json({ success: false, error: 'Aucun CV enregistré. Veuillez d\'abord importer votre CV.' }, { status: 400 });
    }

    let resumeText = studentUser.cvData || '';

    if (!resumeText && studentUser.cvUrl) {
      try {
        const uploadDirBase = path.resolve(process.cwd(), 'uploads', 'cvs');
        const filePath = path.resolve(process.cwd(), studentUser.cvUrl);
        if (!filePath.startsWith(uploadDirBase + path.sep)) {
          return NextResponse.json({ success: false, error: 'Chemin de CV invalide. Veuillez réimporter votre CV.' }, { status: 400 });
        }
        const fileBuffer = await fs.readFile(filePath);
        resumeText = await extractPdfText(fileBuffer);
        if (resumeText) {
          await prisma.user.update({ where: { id: user.id }, data: { cvData: resumeText } }).catch(() => undefined);
        }
      } catch (e) {
        console.error('Error reading CV file from disk:', e);
        return NextResponse.json({ success: false, error: 'Fichier CV introuvable sur le serveur. Veuillez le réimporter.' }, { status: 400 });
      }
    }

    if (!resumeText) {
      return NextResponse.json({ success: false, error: 'Impossible de lire le contenu du CV (document scanné ou vide). Veuillez le réimporter.' }, { status: 400 });
    }

    const contents = `Analyse le CV suivant de l'étudiant et agis en tant que conseiller pédagogique expert. Fournis un texte formaté en Markdown contenant :
1. **Points Forts** (liste claire)
2. **Compétences** (liste claire)
3. **Formations Recommandées** avec titres précis, justifications et liens pertinents si possible.

CV de l'étudiant:
${resumeText}`;

    const recommendationText = await generateWithRetry(contents);

    if (!recommendationText.trim()) {
      return NextResponse.json({ success: false, error: 'Aucune recommandation n\'a pu être générée. Veuillez réessayer.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, text: recommendationText });

  } catch (err: unknown) {
    const errorObj = err as Error & { status?: number };
    const status = errorObj.status || 500;

    console.error('CV Enhancement error:', errorObj);

    if (status === 503 || status === 429) {
      return NextResponse.json(
        { success: false, error: 'Le service IA est temporairement surchargé. Veuillez réessayer dans quelques instants.' },
        { status: 503 }
      );
    }

    if (status === 404) {
      return NextResponse.json(
        { success: false, error: 'Le modèle IA est indisponible. Veuillez contacter l\'administrateur.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: errorObj.message || 'Erreur lors de l\'analyse par l\'IA' },
      { status: 500 }
    );
  }
}