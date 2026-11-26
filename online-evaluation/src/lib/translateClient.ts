/**
 * Cache en memoire pour les traductions dynamiques.
 * Cle : `${targetLang}:${text}` -> Promise<string>
 */
const translationCache = new Map<string, Promise<string>>();

function getSessionStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.sessionStorage) {
    return window.sessionStorage;
  }
  return null;
}

export type TranslateResponse = [
  [string, string, string][],
  string,
  string,
  Record<string, string>
];

export type TranslateSegment = [string, string, string];

export interface TranslateOptions {
  /** Langue source (par defaut 'auto'). */
  sourceLang?: string;
}

/**
 * Traduit un texte arbitraire via l'endpoint public Google Translate.
 * Retourne le texte original en cas d'echec.
 */
export async function translateDynamic(
  text: string,
  targetLang: string,
  options: TranslateOptions = {}
): Promise<string> {
  const normalizedText = text.trim();
  const sourceLang = options.sourceLang || 'auto';

  if (!normalizedText || targetLang === 'auto') {
    return normalizedText;
  }

  const cacheKey = `${targetLang}:${normalizedText}`;

  const cached = translationCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = (async (): Promise<string> => {
    try {
      if (typeof window !== 'undefined') {
        try {
          const stored = getSessionStorage();
          if (stored) {
            const raw = stored.getItem(cacheKey);
            if (raw) {
              const parsed = JSON.parse(raw) as { text: string; lang: string };
              if (parsed.lang === targetLang) {
                return parsed.text;
              }
            }
          }
        } catch {
          // ignore sessionStorage error
        }
      }

      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=${targetLang}&dt=t&q=${encodeURIComponent(normalizedText)}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let data: TranslateResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });

        if (!response.ok) {
          throw new Error(`Google Translate HTTP error: ${response.status}`);
        }

        data = (await response.json()) as TranslateResponse;
      } finally {
        clearTimeout(timeoutId);
      }

      const translatedText = data[0]
        .map((segment: TranslateSegment) => segment[0])
        .filter(Boolean)
        .join('');

      if (typeof window !== 'undefined') {
        try {
          const stored = getSessionStorage();
          if (stored) {
            stored.setItem(cacheKey, JSON.stringify({ text: translatedText, lang: targetLang }));
          }
        } catch {
          // ignore sessionStorage write error
        }
      }

      return translatedText;
    } catch {
      return normalizedText;
    }
  })();

  translationCache.set(cacheKey, promise);

  return promise;
}
