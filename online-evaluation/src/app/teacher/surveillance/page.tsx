'use client';

// Tableau de bord enseignant ExamGuard AI : alertes expliquees, etats de fraude observes,
// chronologie, validation humaine (EF7, EF8, EF9). Un score n'est jamais presente comme une preuve.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRoleGuard } from '@/lib/use-role-guard';

interface Contribution { variable: string; libelle: string; valeur: number; contribution: number; direction: string; texte: string }
interface Explanation { contributions: Contribution[]; unite_contribution: string; probabilite: number }
interface WebcamState { libelle: string; icone: string; images: number; part: number; duree_estimee_s: number; premier_releve: number | null; fiabilite: string }
interface Report {
  id: string;
  mlStatus: string;
  consentWebcam: boolean;
  browserScore: number | null;
  webcamScore: number | null;
  fusedScore: number | null;
  threshold: number | null;
  alert: boolean;
  fusionMode: string | null;
  webcamFrames: number;
  browserEvents: Record<string, number>;
  details: {
    erreur?: string;
    temps_ideal?: { seconds: number; source: string };
    navigateur?: {
      indicateurs?: Record<string, number | string>;
      prediction?: { hors_domaine?: string[] };
      explication?: Explanation;
      etats?: Record<string, { libelle: string; icone: string; nombre: number; part: number }>;
    };
    webcam?: {
      n_images: number; part_images_en_alerte: number; chronologie: number[]; hors_domaine?: string[];
      etats?: Record<string, WebcamState>; chronologie_etats?: string[][]; periode_releve_s?: number;
      image_la_plus_suspecte?: { explication: Explanation };
    } | null;
  };
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'REVIEW';
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  submission: { id: string; score: number; totalScore: number; submittedAt: string; startedAt: string; completedAt: string | null; user: { name: string; email: string }; exam: { title: string } };
}

// file de tri : alertes a examiner d'abord, puis copies a examiner, revues demandees, decisions prises ;
// a priorite egale, le risque le plus eleve d'abord
const priority = (r: Report) => (r.status === 'PENDING' ? (r.alert ? 0 : 1) : r.status === 'REVIEW' ? 2 : 3);
const byPriority = (a: Report, b: Report) => priority(a) - priority(b) || (b.fusedScore ?? -1) - (a.fusedScore ?? -1);

const STATUS: Record<Report['status'], { label: string; cls: string }> = {
  PENDING: { label: 'À examiner', cls: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { label: 'Alerte confirmée', cls: 'bg-rose-100 text-rose-800' },
  REJECTED: { label: 'Alerte rejetée', cls: 'bg-emerald-100 text-emerald-800' },
  REVIEW: { label: 'Revue demandée', cls: 'bg-blue-100 text-blue-800' },
};
// regles navigateur (pas de modele appris) : seuil a partir duquel l'evenement est signale
const EVENT_RULES: { key: string; icone: string; label: string; warnAt: number; unit?: string }[] = [
  { key: 'tabSwitches', icone: '🗂️', label: "Changements d'onglet", warnAt: 1 },
  { key: 'hiddenSeconds', icone: '🙈', label: 'Hors de la page', warnAt: 30, unit: 's' },
  { key: 'windowBlur', icone: '🪟', label: 'Pertes de focus', warnAt: 3 },
  { key: 'paste', icone: '📋', label: 'Collages', warnAt: 1 },
  { key: 'copy', icone: '📄', label: 'Copies', warnAt: 1 },
  { key: 'cut', icone: '✂️', label: 'Coupes', warnAt: 1 },
  { key: 'contextMenu', icone: '🖱️', label: 'Clics droits', warnAt: 3 },
];
const STATE_COLORS: Record<string, string> = {
  telephone: '#e11d48', plusieurs_visages: '#7c3aed', visage_absent: '#0f172a', tete_tournee: '#ea580c', tete_baissee: '#ca8a04', regard_detourne: '#64748b',
};
const pct = (v: number | null | undefined, d = 0) => (typeof v === 'number' ? `${(100 * v).toFixed(d)} %` : '—');
const dur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

function RiskGauge({ value, alert }: { value: number | null; alert: boolean }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const color = alert ? '#e11d48' : v > 0.15 ? '#d97706' : '#059669';
  const c = 2 * Math.PI * 42;
  return (
    <div className="relative h-28 w-28 shrink-0">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black" style={{ color }}>{value == null ? '—' : `${Math.round(100 * v)}`}<span className="text-sm">%</span></span>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">risque</span>
      </div>
    </div>
  );
}

function Reasons({ title, explanation }: { title: string; explanation?: Explanation }) {
  if (!explanation?.contributions?.length) return null;
  const max = Math.max(...explanation.contributions.map((c) => Math.abs(c.contribution)), 1e-9);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {explanation.contributions.map((c) => (
        <div key={c.variable} className="grid grid-cols-[1fr_90px] items-center gap-3 text-sm">
          <span className={c.contribution > 0 ? 'text-rose-700' : 'text-emerald-700'}>{c.texte}</span>
          <span className="relative h-2 rounded bg-slate-100" title={String(c.contribution)}>
            <span className={`absolute top-0 h-2 rounded ${c.contribution > 0 ? 'left-1/2 bg-rose-500' : 'right-1/2 bg-emerald-500'}`} style={{ width: `${(50 * Math.abs(c.contribution)) / max}%` }} />
          </span>
        </div>
      ))}
      <p className="text-xs text-slate-400">SHAP ({explanation.unite_contribution}) · rouge = augmente le risque, vert = le diminue.</p>
    </div>
  );
}

// courbe de risque webcam + une ligne par etat observe, alignees sur le meme axe du temps
function Timeline({ values, states, labels, durationS }: { values: number[]; states?: string[][]; labels: Record<string, WebcamState>; durationS: number }) {
  if (!values?.length) return null;
  const w = 600, h = 60, n = values.length;
  const x = (i: number) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const pts = values.map((v, i) => `${x(i)},${h - v * h}`).join(' ');
  const seen = Object.keys(STATE_COLORS).filter((k) => states?.some((b) => b.includes(k)));
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${w} ${h + seen.length * 14 + 4}`} className="w-full" role="img" aria-label="Chronologie du risque webcam et des états observés">
        <rect x="0" y="0" width={w} height={h} rx="6" fill="#f8fafc" />
        <polyline points={pts} fill="none" stroke="#e11d48" strokeWidth="2" strokeLinejoin="round" />
        {seen.map((k, row) => (
          <g key={k}>
            {states!.map((b, i) => (b.includes(k) ? <rect key={i} x={x(i) - Math.max(w / n / 2, 2)} y={h + 4 + row * 14} width={Math.max(w / n, 4)} height="10" rx="2" fill={STATE_COLORS[k]} /> : null))}
          </g>
        ))}
      </svg>
      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-500">
        <span>Début</span>
        <span className="flex flex-wrap gap-3">{seen.map((k) => <span key={k} className="flex items-center gap-1"><span className="h-2 w-3 rounded" style={{ background: STATE_COLORS[k] }} />{labels[k]?.libelle ?? k}</span>)}</span>
        <span>Fin · {dur(durationS)}</span>
      </div>
    </div>
  );
}

export default function SurveillancePage() {
  useRoleGuard('TEACHER');
  const [reports, setReports] = useState<Report[]>([]);
  const [mlService, setMlService] = useState<{ status?: string; modeles?: Record<string, string>; fusion?: { w_webcam: number } } | null>(null);
  const [filter, setFilter] = useState<'all' | 'alerts' | 'pending'>('all');
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null); // une seule copie depliee a la fois

  const refresh = async (open?: string | null) => {
    const res = await fetch('/api/teacher/proctoring', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) {
      const list = data.reports as Report[];
      setReports(list);
      setMlService(data.mlService);
      setNotes(Object.fromEntries(list.map((r) => [r.id, r.decisionNote || ''])));
      // au chargement, la copie la plus prioritaire est ouverte
      setOpenId((prev) => (open !== undefined ? open : prev ?? ([...list].sort(byPriority)[0]?.id ?? null)));
    }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const decide = async (report: Report, status: Report['status']) => {
    const res = await fetch(`/api/teacher/proctoring/${report.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: notes[report.id] || '' }),
    });
    const data = await res.json();
    setNotice(res.ok ? `Décision enregistrée : ${STATUS[status].label} — ${report.submission.user.name}.` : data.error || 'Décision non enregistrée');
    // decision prise : on passe directement a la copie suivante encore a examiner
    const next = res.ok ? shown.find((r) => r.id !== report.id && r.status === 'PENDING') : report;
    refresh(next?.id ?? null);
  };

  const kpi = useMemo(() => ({
    total: reports.length,
    alerts: reports.filter((r) => r.alert).length,
    pending: reports.filter((r) => r.status === 'PENDING').length,
    confirmed: reports.filter((r) => r.status === 'CONFIRMED').length,
  }), [reports]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter((r) => (filter === 'alerts' ? r.alert : filter === 'pending' ? r.status === 'PENDING' : true))
      .filter((r) => !q || `${r.submission.user.name} ${r.submission.user.email} ${r.submission.exam.title}`.toLowerCase().includes(q))
      .sort(byPriority);
  }, [reports, filter, query]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link href="/teacher/home" className="text-sm font-medium text-emerald-700 hover:underline">← Espace enseignant</Link>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black tracking-tight">Surveillance des examens</h1>
              <p className="text-slate-500">Alertes ExamGuard AI expliquées — vous décidez : confirmer, rejeter ou demander une revue.</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-xs">
              <span className={`h-2 w-2 rounded-full ${mlService?.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Service ML {mlService?.status === 'ok' ? 'opérationnel' : mlService?.status ?? '…'}
              {mlService?.modeles && <span className="text-slate-400">· {mlService.modeles.browser} + {mlService.modeles.webcam}</span>}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: 'Copies surveillées', value: kpi.total, cls: 'text-slate-900' },
              { label: 'Alertes', value: kpi.alerts, cls: 'text-rose-600' },
              { label: 'À examiner', value: kpi.pending, cls: 'text-amber-600' },
              { label: 'Alertes confirmées', value: kpi.confirmed, cls: 'text-slate-900' },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <p className={`text-3xl font-black ${k.cls}`}>{k.value}</p>
                <p className="text-xs font-medium text-slate-500">{k.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-5 px-6 py-6">
        <div className="rounded-2xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
          Un score n&apos;est pas une preuve : il signale un comportement à vérifier. Les états observés sont des faits
          (avec leur fiabilité mesurée) ; les poids de fusion viennent de données simulées et doivent être recalibrés sur le pilote.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-white p-1 ring-1 ring-slate-200">
            {(['all', 'alerts', 'pending'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${filter === f ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                {{ all: 'Toutes', alerts: 'Alertes', pending: 'À examiner' }[f]}
              </button>
            ))}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un étudiant ou un examen…" className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm" />
        </div>
        {!loading && shown.length > 0 && <p className="text-xs text-slate-500">Classées par priorité : alertes à examiner d&apos;abord, puis risque décroissant. Cliquez sur une copie pour la déplier ; après une décision, la suivante s&apos;ouvre.</p>}
        {notice && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
        {loading && <p className="text-slate-500">Chargement…</p>}
        {!loading && shown.length === 0 && <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500">Aucune copie pour ce filtre.</div>}

        {shown.map((r) => {
          const nav = r.details.navigateur;
          const cam = r.details.webcam;
          const ind = nav?.indicateurs || {};
          const camStates = Object.entries(cam?.etats ?? {}).filter(([, s]) => s.images > 0).sort((a, b) => b[1].images - a[1].images);
          const fast = nav?.etats?.reponses_eclair;
          const events = EVENT_RULES.filter((e) => (r.browserEvents[e.key] || 0) > 0);
          const warnings = Array.from(new Set([...(nav?.prediction?.hors_domaine || []), ...(cam?.hors_domaine || [])]));
          const durationS = Number(ind.exam_finish_time_in_sec ?? 0);
          const isOpen = openId === r.id;
          // resume compact visible meme replie : icones des etats observes
          const badges = [
            ...camStates.map(([k, s]) => ({ k, icone: s.icone, title: `${s.libelle} · ${pct(s.part)} du temps` })),
            ...(fast && fast.nombre > 0 ? [{ k: 'eclair', icone: fast.icone, title: `${fast.libelle} : ${fast.nombre}` }] : []),
            ...events.filter((e) => (r.browserEvents[e.key] || 0) >= e.warnAt).map((e) => ({ k: e.key, icone: e.icone, title: `${e.label} : ${r.browserEvents[e.key]}` })),
          ];
          const risk = r.fusedScore == null ? null : Math.round(100 * r.fusedScore);
          return (
            <article key={r.id} className={`overflow-hidden rounded-3xl bg-white shadow-sm ring-1 transition ${r.alert ? 'ring-rose-300' : 'ring-slate-200'} ${isOpen ? 'shadow-md' : 'hover:shadow-md'}`}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : r.id)}
                aria-expanded={isOpen}
                className={`flex w-full flex-wrap items-center justify-between gap-3 px-6 py-4 text-left ${r.alert ? 'bg-rose-50' : 'bg-slate-50'}`}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-sm font-black ${r.alert ? 'bg-rose-600 text-white' : risk != null && risk > 15 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                    {risk == null ? '—' : `${risk}%`}
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold">{r.submission.user.name} <span className="font-normal text-slate-500">· {r.submission.exam.title}</span></h2>
                    <p className="text-xs text-slate-500">{r.submission.user.email} · remis le {new Date(r.submission.completedAt ?? r.submission.submittedAt).toLocaleString()} · note {r.submission.score} / {r.submission.totalScore}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {badges.length > 0 && (
                    <span className="flex gap-1" aria-label={badges.map((b) => b.title).join(', ')}>
                      {badges.slice(0, 5).map((b) => <span key={b.k} title={b.title} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-sm ring-1 ring-slate-200">{b.icone}</span>)}
                      {badges.length > 5 && <span className="grid h-7 place-items-center rounded-lg bg-white px-1.5 text-xs font-bold text-slate-500 ring-1 ring-slate-200">+{badges.length - 5}</span>}
                    </span>
                  )}
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.alert ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>{r.alert ? 'ALERTE' : 'Pas d’alerte'}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  <span className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden>▾</span>
                </div>
              </button>

              {isOpen && <div className="space-y-6 p-6">
                {r.mlStatus !== 'OK' ? (
                  <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">Service ML indisponible lors de la remise ({r.mlStatus}) : aucun score calculé. {r.details.erreur}</p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-6">
                      <RiskGauge value={r.fusedScore} alert={r.alert} />
                      <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-4">
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Session</p><p className="text-xl font-black">{pct(r.browserScore, 1)}</p><p className="text-[11px] text-slate-400">temps et réussite</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Webcam</p><p className="text-xl font-black">{r.consentWebcam && cam ? pct(r.webcamScore, 1) : r.consentWebcam ? 'aucun relevé' : 'refusée'}</p><p className="text-[11px] text-slate-400">{r.webcamFrames} relevés{cam ? ` · ${pct(cam.part_images_en_alerte)} suspects` : ''}</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Réponses</p><p className="text-xl font-black">{String(ind.tot_que_attempted ?? '—')}<span className="text-sm text-slate-400"> / {String(ind.tot_question ?? '—')}</span></p><p className="text-[11px] text-slate-400" title={r.details.temps_ideal?.source ?? 'fixe : 180 s par question'}>{String(ind.que_att_within_idl_time ?? '—')} en ≤ {Math.round(r.details.temps_ideal?.seconds ?? 180)} s (temps idéal)</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] font-semibold uppercase text-slate-500">Durée</p><p className="text-xl font-black">{dur(durationS)}</p><p className="text-[11px] text-slate-400">{r.fusionMode}{r.threshold != null ? ` · seuil ${pct(r.threshold)}` : ''}</p></div>
                      </div>
                    </div>

                    <section>
                      <h3 className="text-sm font-bold text-slate-800">États observés</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {camStates.map(([k, s]) => (
                          <span key={k} className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-900" title={`Premier relevé n° ${s.premier_releve}`}>
                            <span>{s.icone}</span><strong>{s.libelle}</strong>
                            <span>{pct(s.part)} du temps · ~{dur(s.duree_estimee_s)}</span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${s.fiabilite === 'forte' ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>fiabilité {s.fiabilite}</span>
                          </span>
                        ))}
                        {fast && fast.nombre > 0 && (
                          <span className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900"><span>{fast.icone}</span><strong>{fast.libelle}</strong><span>{fast.nombre} ({pct(fast.part)})</span></span>
                        )}
                        {events.map((e) => {
                          const v = r.browserEvents[e.key] || 0;
                          const warn = v >= e.warnAt;
                          return (
                            <span key={e.key} className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs ${warn ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                              <span>{e.icone}</span><strong>{e.label}</strong><span>{v}{e.unit ? ` ${e.unit}` : ''}</span>
                            </span>
                          );
                        })}
                        {!camStates.length && !(fast && fast.nombre) && !events.length && <span className="text-sm text-slate-500">Aucun état particulier observé.</span>}
                      </div>
                      <p className="mt-2 text-[11px] text-slate-400">États webcam : règles calibrées sur des images normales (≈ 1 % de déclenchements), fiabilité mesurée sur le jeu de test. Événements navigateur : règles affichées, pas de modèle appris.</p>
                    </section>

                    {cam?.chronologie && (
                      <section>
                        <h3 className="mb-2 text-sm font-bold text-slate-800">Chronologie</h3>
                        <Timeline values={cam.chronologie} states={cam.chronologie_etats} labels={cam.etats ?? {}} durationS={durationS} />
                      </section>
                    )}

                    <details open={r.alert} className="group rounded-2xl bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-bold text-slate-800">Pourquoi ce score ? (explications SHAP)</summary>
                      <div className="mt-4 grid gap-6 md:grid-cols-2">
                        <Reasons title="Session / navigateur" explanation={nav?.explication} />
                        <Reasons title="Webcam — relevé le plus suspect" explanation={cam?.image_la_plus_suspecte?.explication} />
                      </div>
                    </details>
                    {warnings.length > 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">⚠ Hors du domaine d&apos;entraînement (prédiction moins fiable) : {warnings.join(' ; ')}</p>}
                  </>
                )}

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <textarea value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} rows={2} placeholder="Note de décision (journal d'audit)" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={() => decide(r, 'CONFIRMED')} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Confirmer l&apos;alerte</button>
                    <button onClick={() => decide(r, 'REJECTED')} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Rejeter</button>
                    <button onClick={() => decide(r, 'REVIEW')} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Demander une revue</button>
                    {r.decidedAt && <span className="text-xs text-slate-500">Décision du {new Date(r.decidedAt).toLocaleString()}</span>}
                  </div>
                </div>
              </div>}
            </article>
          );
        })}
      </div>
    </main>
  );
}
