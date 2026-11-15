import { NextResponse } from 'next/server';
import { generateRecommendationJson } from '@/lib/ai';
import { extractPdfText } from '@/lib/pdf';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'Aucun fichier fourni' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const resumeText = await extractPdfText(buffer);

    const prompt = `Analyse le CV suivant et fournis un bilan complet ainsi qu'une liste de formations recommandées pour faire progresser l'étudiant:\n\n${resumeText}`;

    const jsonResult = await generateRecommendationJson(prompt);

    return NextResponse.json({ success: true, data: jsonResult });

  } catch (err: unknown) {
    const errorObj = err as Error & { status?: number };
    console.error('Course recommendation error:', errorObj);

    const status = errorObj.status || 500;
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { success: false, error: 'Le service IA est temporairement surchargé. Veuillez réessayer dans quelques instants.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: false, error: errorObj.message || 'Erreur lors de l\'analyse du CV' }, { status: 500 });
  }
}
