import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { generateRecommendation } from '@/lib/ai';
import path from 'path';
import fs from 'fs/promises';
import { extractPdfText } from '@/lib/pdf';

export const runtime = 'nodejs';

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

    const contents = `Analyse le CV suivant de l'étudiant et agis en tant que conseiller pédagogique expert. Réponds en Markdown strict avec exactement ces sections dans cet ordre :
## 🎯 Analyse du CV — résumé global du profil en 1-2 phrases maximum
## 1️⃣ Points Forts — liste à puces, chaque puce en 1 phrase maximum
## 2️⃣ Compétences — liste à puces, chaque puce en 1 phrase maximum
## 3️⃣ Formations Recommandées — 3 à 5 formations maximum. Pour chacune, une puce au format : - [Titre exact de la formation](https://url-reelle-de-recherche-ou-cours) — justification en une phrase. Le lien DOIT être un vrai lien Markdown cliquable (ex: https://www.coursera.org/search?query=... ou https://www.udemy.com/courses/search/?q=...).
## 📌 Conclusion — conseils finaux en 1-2 phrases maximum
Sois extremely concis partout : 1-2 phrases par puce/paragraphe, pas de longs développements. Utilise des listes à puces sous chaque section et n'écris aucun texte en dehors de ces sections.

CV de l'étudiant:
${resumeText}`;

    const recommendationText = await generateRecommendation(contents);

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
