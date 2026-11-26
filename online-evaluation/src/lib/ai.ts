import Groq from 'groq-sdk';
import { GoogleGenAI, Type } from '@google/genai';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });
const geminiAi = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

// Groq free-tier models, tried in order. If one is unavailable/deprecated,
// the next is used automatically.
const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

// Gemini secondary agent: latest flash-lite first, then stable flash-lite,
// then full flash as a last resort.
const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
];

const SYSTEM_PROMPT = `Tu es un conseiller pédagogique expert. Analyse le CV fourni.
Réponds en Markdown strict, avec exactement ces sections dans cet ordre :
## 🎯 Analyse du CV
## 1️⃣ Points Forts
## 2️⃣ Compétences
## 3️⃣ Formations Recommandées
Règles de style : sois extremely concis. Chaque puce et chaque paragraphe doit tenir en 1 à 2 phrases maximum. Pas de longs développements.
Sous "## 3️⃣ Formations Recommandées", chaque formation DOIT être une ligne de liste à puces dont le titre est un lien Markdown cliquable au format [Titre de la formation](https://...) pointant vers une URL de recherche ou page de cours réelle (ex: https://www.coursera.org/search?query=... ou https://www.udemy.com/courses/search/?q=...), suivie d'une brève justification d'une phrase.
Règles de structure : utilise des listes à puces sous chaque section, une séparation claire entre les sections, et n'écris aucun texte en dehors de ces sections.`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isFatalProviderError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  return status === 401 || status === 403;
}

/**
 * Generate text with Groq (primary free AI provider).
 * Tries each configured Groq model until one succeeds.
 */
export async function generateWithGroq(
  prompt: string,
  options: { json?: boolean; system?: string } = {}
): Promise<string> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY is not configured');
  }

  let lastError: unknown = null;
  for (const model of GROQ_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Groq attempt: model=${model} (try ${attempt})`);
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: options.system || SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.7,
          ...(options.json ? { response_format: { type: 'json_object' as const } } : {}),
        });
        const text = completion.choices[0]?.message?.content || '';
        if (text.trim()) return text;
        throw new Error('Empty Groq response');
      } catch (err) {
        lastError = err;
        if (isFatalProviderError(err)) throw err;
        if (attempt === 2) {
          console.warn(`Groq model ${model} failed, trying next model...`, err);
          break;
        }
        await sleep(1000);
      }
    }
  }
  throw lastError || new Error('All Groq models failed.');
}

/**
 * Generate text with Gemini (secondary agent, flash-lite latest first).
 */
export async function generateWithGemini(prompt: string): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  let lastError: unknown = null;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Gemini attempt: model=${model} (try ${attempt})`);
        const response = await geminiAi.models.generateContent({
          model,
          contents: prompt,
        });
        const text = response.text || '';
        if (text.trim()) return text;
        throw new Error('Empty Gemini response');
      } catch (err) {
        lastError = err;
        if (isFatalProviderError(err)) throw err;
        if (attempt === 2) {
          console.warn(`Gemini model ${model} failed, trying next model...`, err);
          break;
        }
        await sleep(1000);
      }
    }
  }
  throw lastError || new Error('All Gemini models failed.');
}

/**
 * Primary: Groq. Secondary/fallback: Gemini flash-lite.
 * Throws only if both providers fail.
 */
export async function generateRecommendation(prompt: string): Promise<string> {
  if (process.env.GROQ_API_KEY) {
    try {
      const text = await generateWithGroq(prompt);
      console.log('AI recommendation generated with GROQ (primary)');
      return text;
    } catch (groqErr) {
      console.warn('GROQ primary agent failed, failing over to Gemini secondary agent...', groqErr);
    }
  } else {
    console.warn('GROQ_API_KEY is missing. Using Gemini secondary agent directly.');
  }

  const text = await generateWithGemini(prompt);
  console.log('AI recommendation generated with GEMINI (secondary)');
  return text;
}

/**
 * Structured JSON recommendation: Groq (json_object mode) first,
 * Gemini (response schema) as fallback.
 */
export async function generateRecommendationJson(prompt: string) {
  const schema = {
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
            focusArea: { type: Type.STRING },
          },
          required: ['title', 'reason', 'difficulty', 'focusArea'],
        },
      },
    },
    required: ['pointsForts', 'pointsAmeliorer', 'competences', 'recommendedCourses'],
  };

  if (process.env.GROQ_API_KEY) {
    try {
      const text = await generateWithGroq(
        `${prompt}\n\nRéponds UNIQUEMENT avec un objet JSON valide respectant ce schéma: {"pointsForts": string[], "pointsAmeliorer": string[], "competences": string[], "recommendedCourses": [{"title": string, "reason": string, "difficulty": string, "focusArea": string}]}`,
        {
          json: true,
          system:
            "Tu es un conseiller pédagogique expert. Réponds uniquement en JSON valide, sans texte autour.",
        }
      );
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        console.log('Structured recommendation generated with GROQ (primary)');
        return parsed;
      }
    } catch (groqErr) {
      console.warn('GROQ JSON agent failed, failing over to Gemini...', groqErr);
    }
  }

  // Gemini fallback with native response schema
  let lastError: unknown = null;
  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Gemini JSON attempt: model=${model} (try ${attempt})`);
        const response = await geminiAi.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: 'application/json', responseSchema: schema },
        });
        const parsed = JSON.parse(response.text || '{}');
        console.log('Structured recommendation generated with GEMINI (secondary)');
        return parsed;
      } catch (err) {
        lastError = err;
        if (isFatalProviderError(err)) throw err;
        if (attempt === 2) break;
        await sleep(1000);
      }
    }
  }
  throw lastError || new Error('All AI providers failed to generate JSON recommendation.');
}
