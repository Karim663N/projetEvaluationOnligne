'use client';

import { useEffect } from 'react';
import { useLang } from '@/lib/use-lang';
import { translateDynamic } from '@/lib/translateClient';

const TITLES: Record<string, string> = {
  fr: 'ITBS · Évaluation en ligne — ExamGuard AI',
  en: 'ITBS · Online evaluation — ExamGuard AI',
  ar: 'ITBS · التقييم عبر الإنترنت — ExamGuard AI',
};

export default function DocumentTitle() {
  const [lang] = useLang();
  useEffect(() => {
    document.title = TITLES[lang] ?? TITLES.fr;
    if (lang !== 'fr') {
      translateDynamic(TITLES.fr, lang).then((res) => {
        document.title = res;
      });
    }
  }, [lang]);
  return null;
}
