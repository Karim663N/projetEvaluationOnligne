'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { translateDynamic } from './translateClient';

export type Lang = 'en' | 'fr' | 'ar';

interface LanguageContextType {
  lang: Lang;
  setLang: (newLang: Lang) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'en',
  setLang: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const saved = localStorage.getItem('app_lang') as Lang | null;
    if (saved === 'en' || saved === 'fr' || saved === 'ar') {
      setLangState(saved);
    }
  }, []);

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang(): Lang {
  return useContext(LanguageContext).lang;
}

export function useSetLang(): (newLang: Lang) => void {
  return useContext(LanguageContext).setLang;
}

/**
 * useDynamicText - Returns a dynamically translated text based on the current language.
 * When `lang` changes, the effect re-runs and fetches the translation for the new language.
 * 
 * @param text The text to translate
 * @returns The translated text (or original if translation fails)
 */
export function useDynamicText(text: string): string {
  const lang = useLang();
  const [translated, setTranslated] = useState<string>(text);

  useEffect(() => {
    // Immediately clear if no text
    if (!text) {
      setTranslated('');
      return;
    }

    // Show the original text while the new language translation is in flight
    setTranslated(text);

    // Nothing to translate when the target language is English
    if (lang === 'en') {
      return;
    }

    // Cancel previous translation if effect re-runs
    let active = true;

    translateDynamic(text, lang)
      .then((res) => {
        if (active) {
          setTranslated(res);
        }
      })
      .catch(() => {
        if (active) {
          setTranslated(text);
        }
      });

    return () => {
      active = false;
    };
  }, [text, lang]);

  return translated;
}

/**
 * DynamicText - Component wrapper around useDynamicText.
 * Use this inside .map() loops or anywhere a hook cannot be called directly.
 */
export function DynamicText({ text }: { text?: string | null }) {
  return <>{useDynamicText(text || '')}</>;
}

/**
 * useT - Returns a translate function `t(text)` usable anywhere in render,
 * including JSX expressions, placeholders, and attributes.
 * Returns the original text until the translation resolves.
 */
export function useT(): (text: string) => string {
  const lang = useLang();
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());

  const t = useCallback(
    (text: string): string => {
      if (!text) return text;
      const key = `${lang}:${text}`;
      const cached = resolved[key];
      if (cached !== undefined) return cached;
      if (lang === 'en') return text;
      if (!pending.current.has(key)) {
        pending.current.add(key);
        translateDynamic(text, lang)
          .then((res) => {
            pending.current.delete(key);
            setResolved((prev) => ({ ...prev, [key]: res }));
          })
          .catch(() => {
            pending.current.delete(key);
          });
      }
      return text;
    },
    [lang, resolved]
  );

  return t;
}

/**
 * useDynamicList - Returns dynamically translated list based on the current language.
 * When `lang` changes, the effect re-runs and fetches translations for the new language.
 * 
 * @param items The items to translate
 * @returns The translated list (or original items if translation fails)
 */
export function useDynamicList(items: string[]): string[] {
  const lang = useLang();
  const [translatedList, setTranslatedList] = useState<string[]>(items);
  // Depend on the serialized content, not the array identity, so inline arrays
  // don't retrigger the effect (and a state update) on every render.
  const itemsKey = JSON.stringify(items || []);

  useEffect(() => {
    const list = JSON.parse(itemsKey) as string[];

    // Immediately clear if no items
    if (!list || list.length === 0) {
      setTranslatedList([]);
      return;
    }

    setTranslatedList(list);

    // Nothing to translate when the target language is English
    if (lang === 'en') {
      return;
    }

    // Cancel previous translation if effect re-runs
    let active = true;

    Promise.all(list.map((item) => translateDynamic(item, lang)))
      .then((res) => {
        if (active) {
          setTranslatedList(res);
        }
      })
      .catch(() => {
        if (active) {
          setTranslatedList(list);
        }
      });

    return () => {
      active = false;
    };
  }, [itemsKey, lang]);

  return translatedList;
}
