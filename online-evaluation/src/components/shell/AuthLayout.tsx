// Mise en page des ecrans d'authentification : panneau de marque a gauche, formulaire a droite.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Brand } from '@/components/ui/kit';

const POINTS = [
  { icon: 'shield', title: 'Surveillance expliquée', text: 'Chaque alerte est justifiée (SHAP) et validée par l’enseignant.' },
  { icon: 'eye', title: 'Respect de la vie privée', text: 'La webcam est analysée dans le navigateur : aucune image envoyée.' },
  { icon: 'zap', title: 'Examen fluide', text: 'Une question à la fois, sauvegarde automatique, reprise instantanée.' },
];

export default function AuthLayout({ title, subtitle, children, footer, badge }: {
  title: string; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; badge?: string;
}) {
  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden eg-aurora p-10 text-white lg:flex lg:flex-col">
        <div className="eg-grid-bg absolute inset-0" />
        <Link href="/" className="relative w-fit"><Brand dark /></Link>
        <div className="relative my-auto max-w-md">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-glow-400" /> Plateforme d’évaluation intelligente
          </p>
          <h2 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight">
            Des examens en ligne <span className="eg-text-gradient">fiables, justes et transparents.</span>
          </h2>
          <ul className="mt-10 space-y-5">
            {POINTS.map((p) => (
              <li key={p.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15 backdrop-blur"><Icon name={p.icon} className="h-5 w-5 text-glow-400" /></span>
                <span><span className="block text-sm font-semibold">{p.title}</span><span className="block text-sm text-slate-300">{p.text}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-slate-400">© {new Date().getFullYear()} ITBS · ExamGuard AI — un score n’est jamais une preuve : l’humain décide.</p>
      </aside>

      <main className="flex flex-col px-6 py-8 sm:px-10">
        <div className="flex items-center justify-between lg:justify-end">
          <Link href="/" className="lg:hidden"><Brand /></Link>
          <Link href="/" className="eg-btn eg-btn-ghost eg-btn-sm"><Icon name="chevronLeft" className="h-4 w-4" /> Accueil</Link>
        </div>
        <div className="mx-auto my-auto w-full max-w-sm animate-fade-up py-10">
          {badge && <span className="eg-badge eg-badge-brand mb-4">{badge}</span>}
          <h1 className="text-[28px] font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-sm text-slate-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

/** Champ de formulaire avec icone a gauche */
export function Field({ label, icon, children, hint }: { label: string; icon?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="eg-label">{label}</span>
      <span className="relative block">
        {icon && <Icon name={icon} className="pointer-events-none absolute start-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />}
        {children}
      </span>
      {hint && <span className="eg-hint block">{hint}</span>}
    </label>
  );
}
