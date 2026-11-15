import { NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { extractPdfText } from '@/lib/pdf';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Analyse le CV suivant et fournis un bilan complet ainsi qu'une liste de formations recommandées pour faire progresser l'étudiant:\n\n${resumeText}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pointsForts: { type: Type.ARRAY, items: { type: Type.STRING } },
            pointsAmeliorer: { type: Type.ARRAY, items: { type: Type.STRING } },
            competences: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendedCourses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  difficulty: { type: Type.STRING },
                  focusArea: { type: Type.STRING }
                },
                required: ['title', 'reason', 'difficulty', 'focusArea']
              }
            }
          },
          required: ['pointsForts', 'pointsAmeliorer', 'competences', 'recommendedCourses']
        }
      }
    });

    const jsonResult = JSON.parse(response.text || '{}');
    return NextResponse.json({ success: true, data: jsonResult });

  } catch (err: unknown) {
    const errorObj = err as Error;
    console.error('Course recommendation error:', errorObj);
    return NextResponse.json({ success: false, error: errorObj.message || 'Erreur lors de l\'analyse du CV' }, { status: 500 });
  }
}
