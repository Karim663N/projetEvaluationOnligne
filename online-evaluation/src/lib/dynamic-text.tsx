'use client';

// Traduction dynamique des textes de l'interface.
// Les pages sont ecrites en francais ; quand la langue choisie n'est pas le
// francais, chaque texte est traduit a la volee via Google Translate
// (translateDynamic), avec cache memoire + sessionStorage.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/use-lang';
import { translateDynamic } from '@/lib/translateClient';

const BASE_LANG = 'fr';

function needsTranslation(text: string): boolean {
  return /[A-Za-zÀ-ÿ؀-ۿ]/.test(text);
}

function shouldTranslate(lang: string, text: string): boolean {
  return !!text && lang !== BASE_LANG && needsTranslation(text);
}

/**
 * useT - Retourne une fonction t(texte) utilisable dans le rendu,
 * y compris dans les expressions JSX, placeholders et attributs.
 * Retourne le texte original jusqu'a ce que la traduction resolve.
 */
export function useT(): (text: string) => string {
  const [lang] = useLang();
  const [resolved, setResolved] = useState<Record<string, string>>({});
  const pending = useRef(new Set<string>());

  const t = useCallback(
    (text: string): string => {
      if (!text) return text;
      const key = `${lang}:${text}`;
      const cached = resolved[key];
      if (cached !== undefined) return cached;
      if (!shouldTranslate(lang, text)) return text;
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
 * DynamicText - Wrapper autour de useT pour le texte JSX.
 */
export function DynamicText({ text }: { text?: string | null }) {
  const t = useT();
  return <>{t(text || '')}</>;
}

/**
 * useDynamicText - traduit un texte dynamique (ex: valeur d'etat).
 */
export function useDynamicText(text: string): string {
  const [lang] = useLang();
  const [translated, setTranslated] = useState<string>(text);

  useEffect(() => {
    if (!text) {
      setTranslated('');
      return;
    }
    setTranslated(text);
    if (!shouldTranslate(lang, text)) {
      return;
    }
    let active = true;
    translateDynamic(text, lang)
      .then((res) => {
        if (active) setTranslated(res);
      })
      .catch(() => {
        if (active) setTranslated(text);
      });
    return () => {
      active = false;
    };
  }, [text, lang]);

  return translated;
}

/**
 * useDynamicList - traduit une liste de textes (options, statuts, etc.).
 */
export function useDynamicList(items: string[]): string[] {
  const [lang] = useLang();
  const [translatedList, setTranslatedList] = useState<string[]>(items || []);
  const itemsKey = JSON.stringify(items || []);

  useEffect(() => {
    const list = JSON.parse(itemsKey) as string[];
    if (!list || list.length === 0) {
      setTranslatedList([]);
      return;
    }
    setTranslatedList(list);
    if (lang === BASE_LANG) {
      return;
    }
    let active = true;
    Promise.all(list.map((item) => (shouldTranslate(lang, item) ? translateDynamic(item, lang) : Promise.resolve(item))))
      .then((res) => {
        if (active) setTranslatedList(res);
      })
      .catch(() => {
        if (active) setTranslatedList(list);
      });
    return () => {
      active = false;
    };
  }, [itemsKey, lang]);

  return translatedList;
}
