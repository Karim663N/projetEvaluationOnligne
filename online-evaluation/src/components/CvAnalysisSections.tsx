'use client';

import React from 'react';
import { translations } from '@/lib/i18n';
import { useLang } from '@/lib/use-lang';
import { DynamicText, useT } from '@/lib/dynamic-text';

interface ParsedSection {
  header: string;
  body: string;
}

interface SectionMeta {
  match: RegExp;
  icon: string;
  /** Cle de traduction dans lib/i18n (titre canonique anglais). */
  titleKey: 'aiAnalysis' | 'pointsFort' | 'competences' | 'formations';
  badge: string;
  iconWrap: string;
}

const SECTION_META: SectionMeta[] = [
  {
    match: /analyse|analysis/i,
    icon: '🔍',
    titleKey: 'aiAnalysis',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
    iconWrap: 'bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400',
  },
  {
    match: /points?\s*forts?|strengths?/i,
    icon: '💪',
    titleKey: 'pointsFort',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    iconWrap: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
  },
  {
    match: /comp.tences?|skills?/i,
    icon: '🧠',
    titleKey: 'competences',
    badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    iconWrap: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  },
  {
    match: /formations?|recommand|courses?/i,
    icon: '🎓',
    titleKey: 'formations',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    iconWrap: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
  },
];

const FALLBACK_META: SectionMeta = {
  match: /./,
  icon: '📄',
  titleKey: 'aiAnalysis',
  badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  iconWrap: 'bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function stripEmoji(text: string): string {
  return text.replace(/[\p{Extended_Pictographic}\p{Emoji_Component}]/gu, '').trim();
}

function parseSections(text: string): ParsedSection[] {
  const chunks = text
    .split(/^##\s+/m)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const hasHeader = chunks.length > 0 && /^##\s+/m.test(text);
  const preamble = hasHeader ? '' : text;

  const sections: ParsedSection[] = [];
  if (!hasHeader && preamble.trim()) {
    sections.push({ header: '', body: preamble.trim() });
  } else if (hasHeader) {
    for (const chunk of chunks) {
      const newlineIndex = chunk.indexOf('\n');
      if (newlineIndex === -1) {
        sections.push({ header: chunk, body: '' });
      } else {
        sections.push({
          header: chunk.slice(0, newlineIndex).trim(),
          body: chunk.slice(newlineIndex + 1).trim(),
        });
      }
    }
  }

  // On ignore l'ancienne section « Conclusion » — elle n'est plus demandee.
  return sections.filter((s) => !/conclusion|conseil|summary/i.test(s.header));
}

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInline(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(LINK_RE)) {
    const index = match.index ?? 0;
    if (index > last) nodes.push(<DynamicText key={key++} text={text.slice(last, index)} />);
    nodes.push(
      <a
        key={key++}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
      >
        <DynamicText text={match[1]} />
        <span aria-hidden className="ml-0.5 text-[10px]">↗</span>
      </a>
    );
    last = index + match[0].length;
  }
  if (last < text.length) nodes.push(<DynamicText key={key++} text={text.slice(last)} />);
  return nodes;
}

function SectionBody({ body }: { body: string }) {
  const lines = body.split('\n');
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={key++} className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
        {items.map((item, i) => (
          <li key={i}>
            {renderInline(item)}
          </li>
        ))}
      </ul>
    );
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const bulletMatch = line.match(/^[-*•]\s+(.*)$/) || line.match(/^\d+[.)]\s+(.*)$/);
    if (bulletMatch) {
      bullets.push(bulletMatch[1]);
    } else {
      // On retire les marqueurs markdown gras pour un affichage plus propre.
      const cleaned = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
      flushBullets();
      blocks.push(
        <p key={key++} className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {renderInline(cleaned)}
        </p>
      );
    }
  }
  flushBullets();

  return <div className="space-y-2">{blocks}</div>;
}

export default function CvAnalysisSections({ text }: { text: string }) {
  const [lang] = useLang();
  const t = translations[lang];
  const tt = useT();
  const sections = parseSections(text);

  if (sections.length === 0) {
    return (
      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-6 text-sm leading-relaxed text-slate-700 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-slate-300">
        <DynamicText text={text} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {sections.map((section, index) => {
        const cleanHeader = stripEmoji(section.header);
        const meta = SECTION_META.find((m) => m.match.test(cleanHeader)) || FALLBACK_META;
        const displayTitle = t[meta.titleKey];

        return (
          <article
            key={index}
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-gray-900"
          >
            <header className="mb-3 flex items-center gap-2.5 border-b border-slate-100 pb-2.5 dark:border-slate-800">
              <span
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm ${meta.iconWrap}`}
                aria-hidden
              >
                {meta.icon}
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-sm font-bold text-slate-900 dark:text-white">
                  {displayTitle}
                </h4>
                {section.header && cleanHeader && (
                  <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
                    <DynamicText text={cleanHeader} />
                  </p>
                )}
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${meta.badge}`}>
                {String(index + 1).padStart(2, '0')}
              </span>
            </header>
            <div className="flex-1">
              {section.body ? (
                <SectionBody body={section.body} />
              ) : (
                <p className="text-xs italic text-slate-400 dark:text-slate-500">{tt('Aucun détail fourni.')}</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
