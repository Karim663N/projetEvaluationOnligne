'use client';

// Langue de l'interface partagee entre la barre laterale et les pages (francais par defaut).
import { useCallback, useEffect, useState } from 'react';
import { translations, type Language } from '@/lib/i18n';

const KEY = 'app_lang';
const EVENT = 'app-lang-change';

export function useLang(): [Language, (lang: Language) => void] {
  const [lang, setLangState] = useState<Language>('fr');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Language | null;
      if (saved && saved in translations) setLangState(saved);
    } catch { /* stockage indisponible */ }
    const onChange = (e: Event) => setLangState((e as CustomEvent<Language>).detail);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  const setLang = useCallback((next: Language) => {
    try { localStorage.setItem(KEY, next); } catch { /* stockage indisponible */ }
    setLangState(next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return [lang, setLang];
}
