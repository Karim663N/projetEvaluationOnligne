'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Brand } from '@/components/ui/kit';
import { useT } from '@/lib/dynamic-text';

const FEATURES = [
  { icon: 'layers', title: 'Une question à la fois', text: 'Navigation par grille, questions à revoir, raccourcis clavier et sauvegarde automatique : fini les longues pages à faire défiler.' },
  { icon: 'shield', title: 'Surveillance expliquée', text: 'Chaque score de risque est accompagné des raisons (SHAP) : temps de réponse, réussite, comportements observés.' },
  { icon: 'eye', title: 'États de fraude lisibles', text: 'Téléphone, plusieurs visages, visage absent, tête tournée… avec une fiabilité mesurée sur des données de test.' },
  { icon: 'lock', title: 'Vie privée par conception', text: 'La webcam est analysée dans le navigateur : seuls 26 indicateurs sont transmis, jamais d’image ni de vidéo.' },
  { icon: 'flag', title: 'File de tri enseignant', text: 'Les alertes à examiner remontent en premier ; après chaque décision, la copie suivante s’ouvre automatiquement.' },
  { icon: 'award', title: 'Badges & certificats', text: 'Valorisez la réussite et l’intégrité avec des badges et des certificats vérifiables, prêts à imprimer.' },
];

const STEPS = [
  { n: '01', title: 'Consentement éclairé', text: 'L’étudiant sait exactement ce qui est mesuré. La webcam reste facultative.' },
  { n: '02', title: 'Examen serein', text: 'Minuteur serveur, reprise après coupure, révision avant remise.' },
  { n: '03', title: 'Décision humaine', text: 'Le score n’est jamais une preuve : l’enseignant confirme, rejette ou demande une revue.' },
];

function ProductPreview() {
  const t = useT();
  const bars = [8, 10, 9, 12, 11, 9, 10, 64, 72, 70, 68, 15, 10, 9, 11, 8, 10, 9];
  return (
    <div className="relative animate-float">
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-tr from-brand-500/30 via-violet-500/20 to-glow-400/30 blur-2xl" />
      <div className="relative overflow-hidden rounded-3xl bg-white/[0.07] p-5 ring-1 ring-white/15 backdrop-blur-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500 text-sm font-bold text-white">54%</span>
            <div>
              <p className="text-sm font-semibold text-white">{t('Copie · Algorithmique L2')}</p>
              <p className="text-xs text-slate-400">{t('remise il y a 3 min · note 13 / 20')}</p>
            </div>
          </div>
          <span className="rounded-full bg-rose-500/90 px-2.5 py-1 text-[10px] font-bold text-white">{t('ALERTE')}</span>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {[['📱', 'Téléphone détecté', '25 %'], ['👥', 'Plusieurs visages', '3 %'], ['🚫', 'Visage absent', '3 %']].map(([i, label, p]) => (
            <span key={label} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] text-white ring-1 ring-white/10">
              <span>{i}</span><strong className="font-semibold">{t(label)}</strong><span className="text-slate-400">{p}</span>
              <span className="rounded bg-emerald-400/20 px-1 text-[9px] font-bold text-emerald-300">{t('fiabilité forte')}</span>
            </span>
          ))}
        </div>
        <div className="mt-5 rounded-2xl bg-ink-950/60 p-4 ring-1 ring-white/10">
          <div className="flex items-end gap-1.5" style={{ height: 72 }}>
            {bars.map((h, i) => <span key={i} className={`flex-1 rounded-t ${h > 40 ? 'bg-gradient-to-t from-rose-600 to-rose-400' : 'bg-white/15'}`} style={{ height: `${h}%` }} />)}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-500"><span>{t('Début')}</span><span>{t('Chronologie du risque')}</span><span>{t('Fin · 25 min')}</span></div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          {[['Rejeter', 'bg-white/10 text-white'], ['Revue', 'bg-white/10 text-white'], ['Confirmer', 'bg-rose-500 text-white']].map(([label, c]) => (
            <span key={label} className={`rounded-xl py-2 text-xs font-semibold ${c}`}>{t(label)}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const t = useT();
  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden eg-aurora text-white">
        <div className="eg-grid-bg absolute inset-0" />
        <header className="relative mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Brand dark />
          <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
            <a href="#fonctionnalites" className="hover:text-white">{t('Fonctionnalités')}</a>
            <a href="#fonctionnement" className="hover:text-white">{t('Fonctionnement')}</a>
            <a href="#confidentialite" className="hover:text-white">{t('Confidentialité')}</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="eg-btn eg-btn-sm px-3.5 py-2 text-white hover:bg-white/10">{t('Connexion')}</Link>
            <Link href="/register" className="eg-btn eg-btn-sm bg-white px-3.5 py-2 text-ink-950 hover:bg-slate-100">{t('Créer un compte')}</Link>
          </div>
        </header>

        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-24 pt-12 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <div className="animate-fade-up">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 ring-1 ring-white/15 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-glow-400" /> {t('ITBS · Évaluation en ligne nouvelle génération')}
            </p>
            <h1 className="mt-6 text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              {t('Des examens en ligne')} <span className="eg-text-gradient">{t('intelligents, équitables et transparents.')}</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              {t('ExamGuard AI accompagne chaque examen : une expérience fluide pour l’étudiant, une surveillance qui s’explique pour l’enseignant, et toujours une décision humaine.')}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/register" className="eg-btn eg-btn-primary eg-btn-lg">{t('Commencer gratuitement')} <Icon name="arrowRight" className="h-4 w-4" /></Link>
              <Link href="/login" className="eg-btn eg-btn-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15">{t('J’ai déjà un compte')}</Link>
            </div>
            <dl className="mt-12 grid max-w-lg grid-cols-3 gap-6">
              {[['6', 'états de fraude lisibles'], ['0 %', 'faux « téléphone » sur images normales'], ['100 %', 'décisions validées par l’humain']].map(([v, label]) => (
                <div key={label}><dt className="text-2xl font-bold text-white">{v}</dt><dd className="mt-1 text-xs leading-snug text-slate-400">{t(label)}</dd></div>
              ))}
            </dl>
          </div>
          <ProductPreview />
        </div>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eg-eyebrow">{t('Fonctionnalités')}</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t('Tout ce qu’il faut pour évaluer en confiance')}</h2>
          <p className="mt-4 text-slate-500">{t('Pensé pour les étudiants, les enseignants et l’administration de l’établissement.')}</p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="eg-card eg-card-hover p-6">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-brand-500/30"><Icon name={f.icon} /></span>
              <h3 className="mt-5 text-base font-semibold text-slate-900">{t(f.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{t(f.text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="fonctionnement" className="bg-slate-50 py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <p className="eg-eyebrow">{t('Fonctionnement')}</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{t('Trois étapes, zéro boîte noire')}</h2>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative overflow-hidden rounded-2xl bg-white p-7 ring-1 ring-slate-200">
                <span className="absolute -end-2 -top-4 text-7xl font-black text-slate-100">{s.n}</span>
                <h3 className="relative text-lg font-semibold text-slate-900">{t(s.title)}</h3>
                <p className="relative mt-2 text-sm leading-relaxed text-slate-500">{t(s.text)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="confidentialite" className="mx-auto max-w-7xl px-6 py-24">
        <div className="relative overflow-hidden rounded-3xl eg-aurora px-8 py-14 text-white md:px-14">
          <div className="eg-grid-bg absolute inset-0" />
          <div className="relative grid items-center gap-10 md:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">{t('La confiance se construit avec transparence.')}</h2>
              <p className="mt-4 max-w-xl text-slate-300">{t('Consentement explicite, webcam facultative et analysée localement, explications pour chaque alerte et journal d’audit des décisions.')}</p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-end">
              <Link href="/register" className="eg-btn eg-btn-lg bg-white text-ink-950 hover:bg-slate-100">{t('Créer un compte')}</Link>
              <Link href="/login" className="eg-btn eg-btn-lg bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15">{t('Se connecter')}</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500">
          <Brand />
          <p>© {new Date().getFullYear()} ITBS · ExamGuard AI. {t('Un score n’est jamais une preuve.')}</p>
        </div>
      </footer>
    </div>
  );
}
