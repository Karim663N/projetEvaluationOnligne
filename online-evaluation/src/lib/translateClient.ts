/**
 * In-memory cache for dynamic translations.
 * Key format: `${targetLang}:${text}` -> Promise<string>
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
  /** The source language (defaults to 'auto'). */
  sourceLang?: string;
}

/**
 * Translate arbitrary text using the public Google Translate endpoint.
 *
 * @param text The text to translate.
 * @param targetLang The target language code (e.g. 'en', 'fr', 'ar').
 * @param options Optional source language configuration.
 * @returns The translated text, or the original text if translation fails.
 */
export async function translateDynamic(
  text: string,
  targetLang: string,
  options: TranslateOptions = {}
): Promise<string> {
  const normalizedText = text.trim();
  const sourceLang = options.sourceLang || 'auto';

  // Fallback: empty or target language is auto
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

      console.log('[TranslateDebug]', { text: normalizedText, targetLang, url });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      let data: TranslateResponse;
      try {
        const response = await fetch(url, { signal: controller.signal });

        console.log('[TranslateDebugResponse]', { status: response.status, ok: response.ok });

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
    } catch (err) {
      console.error('[TranslateDebugError]', err);
      return normalizedText;
    }
  })();

  translationCache.set(cacheKey, promise);

  return promise;
}
