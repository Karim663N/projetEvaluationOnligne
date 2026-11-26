'use client';

// Briques d'interface partagees : logo, en-tete de page, cartes de statistiques, etat vide, avatar.
import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useT } from '@/lib/dynamic-text';

export function LogoMark({ className = 'h-9 w-9' }: { className?: string }) {
  // identifiant unique : le logo apparait plusieurs fois (barre laterale masquee + tiroir mobile)
  const gid = `eg-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7f84f6" />
          <stop offset="0.55" stopColor="#5242e2" />
          <stop offset="1" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gid})`} />
      <path d="M20 8.5c2.6 2.1 5.6 3.2 8.8 3.3v7.4c0 6.1-3.7 10.2-8.8 12.3-5.1-2.1-8.8-6.2-8.8-12.3v-7.4c3.2-.1 6.2-1.2 8.8-3.3Z" fill="rgba(255,255,255,0.16)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m15.8 20.2 3 3 5.6-6" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Brand({ dark = false, sub = 'ITBS · Évaluation en ligne' }: { dark?: boolean; sub?: string }) {
  const t = useT();
  return (
    <span className="flex items-center gap-3">
      <LogoMark />
      <span className="leading-tight">
        <span className={`block text-[15px] font-bold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
          ExamGuard <span className={dark ? 'text-glow-400' : 'text-brand-600'}>AI</span>
        </span>
        <span className={`block text-[11px] font-medium ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t(sub)}</span>
      </span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="eg-eyebrow">{eyebrow}</p>}
        <h1 className="eg-title mt-1">{title}</h1>
        {subtitle && <p className="eg-subtitle max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-50 text-brand-600 ring-brand-100',
  green: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-600 ring-amber-100',
  red: 'bg-rose-50 text-rose-600 ring-rose-100',
  cyan: 'bg-cyan-50 text-cyan-600 ring-cyan-100',
  violet: 'bg-violet-50 text-violet-600 ring-violet-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
} as const;
export type Tone = keyof typeof TONES;

export function StatCard({ label, value, icon, tone = 'brand', hint }: { label: string; value: ReactNode; icon: string; tone?: Tone; hint?: ReactNode }) {
  return (
    <div className="eg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${TONES[tone]}`}><Icon name={icon} className="h-[18px] w-[18px]" /></span>
      </div>
      <p className="mt-2 text-[28px] font-bold leading-none tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function IconBubble({ icon, tone = 'brand', className = 'h-11 w-11' }: { icon: string; tone?: Tone; className?: string }) {
  return <span className={`grid shrink-0 place-items-center rounded-2xl ring-1 ring-inset ${TONES[tone]} ${className}`}><Icon name={icon} /></span>;
}

export function EmptyState({ icon = 'layers', title, text, action }: { icon?: string; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="eg-empty">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-brand-600 shadow-sm ring-1 ring-slate-200"><Icon name={icon} /></span>
      <p className="mt-4 text-[15px] font-semibold text-slate-800">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const AVATAR_GRADIENTS = ['from-brand-500 to-violet-500', 'from-cyan-500 to-brand-500', 'from-emerald-500 to-cyan-500', 'from-amber-500 to-rose-500', 'from-violet-500 to-fuchsia-500'];

export function Avatar({ name, src, className = 'h-9 w-9 text-sm' }: { name?: string | null; src?: string | null; className?: string }) {
  const initials = (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  const g = AVATAR_GRADIENTS[(name || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR_GRADIENTS.length];
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={`shrink-0 rounded-full object-cover ring-2 ring-white ${className}`} />;
  }
  return <span className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br font-semibold text-white ${g} ${className}`}>{initials}</span>;
}

/** Anneau de progression (0..1) */
export function ProgressRing({ value, size = 64, stroke = 7, color = '#5242e2', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-200/70" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-bold text-slate-900">{children}</span>
    </span>
  );
}
