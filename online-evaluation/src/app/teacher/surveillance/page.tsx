'use client';

// Tableau de bord enseignant ExamGuard AI : alertes expliquees + validation humaine (EF7, EF8, EF9).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRoleGuard } from '@/lib/use-role-guard';

interface Contribution { variable: string; libelle: string; valeur: number; contribution: number; direction: string; texte: string }
interface Explanation { contributions: Contribution[]; unite_contribution: string; probabilite: number }
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
    navigateur?: { indicateurs?: Record<string, number | string>; prediction?: { hors_domaine?: string[]; seuil?: number; probabilite?: number }; explication?: Explanation };
    webcam?: { n_images: number; part_images_en_alerte: number; max_probabilite_deploiement: number; chronologie: number[]; hors_domaine?: string[]; image_la_plus_suspecte?: { explication: Explanation } } | null;
    fusion?: { source_des_poids?: string; w_webcam?: number };
  };
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'REVIEW';
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
  submission: { id: string; score: number; totalScore: number; status: string; submittedAt: string; user: { name: string; email: string }; exam: { title: string } };
}

const STATUS_LABEL: Record<Report['status'], string> = { PENDING: 'À examiner', CONFIRMED: 'Alerte confirmée', REJECTED: 'Alerte rejetée', REVIEW: 'Revue demandée' };
const STATUS_CLASS: Record<Report['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800', CONFIRMED: 'bg-rose-100 text-rose-800', REJECTED: 'bg-emerald-100 text-emerald-800', REVIEW: 'bg-blue-100 text-blue-800',
};
const EVENT_LABEL: Record<string, string> = {
  tabSwitches: "Changements d'onglet", windowBlur: 'Pertes de focus', copy: 'Copier', paste: 'Coller', cut: 'Couper',
  contextMenu: 'Clics droits', hiddenSeconds: 'Secondes hors de la page',
};
const pct = (v: number | null | undefined) => (typeof v === 'number' ? `${(100 * v).toFixed(1)} %` : '—');

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
      <p className="text-xs text-slate-400">Contributions SHAP ({explanation.unite_contribution}) ; rouge = augmente le risque, vert = le diminue.</p>
    </div>
  );
}

function Timeline({ values }: { values: number[] }) {
  if (!values?.length) return null;
  const w = 300, h = 48;
  const pts = values.map((v, i) => `${(i / Math.max(values.length - 1, 1)) * w},${h - v * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full max-w-sm" role="img" aria-label="Chronologie du risque webcam">
      <rect x="0" y="0" width={w} height={h} className="fill-slate-50" />
      <polyline points={pts} fill="none" stroke="#e11d48" strokeWidth="1.5" />
    </svg>
  );
}

export default function SurveillancePage() {
  useRoleGuard('TEACHER');
  const [reports, setReports] = useState<Report[]>([]);
  const [mlService, setMlService] = useState<{ status?: string; modeles?: Record<string, string>; fusion?: { w_webcam: number } } | null>(null);
  const [filter, setFilter] = useState<'all' | 'alerts' | 'pending'>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    const res = await fetch('/api/teacher/proctoring', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok) {
      setReports(data.reports);
      setMlService(data.mlService);
      setNotes(Object.fromEntries((data.reports as Report[]).map((r) => [r.id, r.decisionNote || ''])));
    }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const decide = async (report: Report, status: Report['status']) => {
    const res = await fetch(`/api/teacher/proctoring/${report.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, note: notes[report.id] || '' }),
    });
    const data = await res.json();
    setNotice(res.ok ? `Décision enregistrée : ${STATUS_LABEL[status]} (${report.submission.user.name}).` : data.error || 'Décision non enregistrée');
    refresh();
  };

  const shown = useMemo(() => reports.filter((r) => (filter === 'alerts' ? r.alert : filter === 'pending' ? r.status === 'PENDING' : true)), [reports, filter]);

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 md:p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <Link href="/teacher/home" className="text-sm text-emerald-700">← Teacher workspace</Link>
          <h1 className="mt-2 text-3xl font-bold">Surveillance des examens</h1>
          <p className="text-slate-500">Alertes ExamGuard AI expliquées. Vous décidez : confirmer, rejeter ou demander une revue.</p>
        </header>
        <div className="rounded-xl border-l-4 border-amber-500 bg-amber-50 p-4 text-sm text-amber-900">
          Un score n&apos;est pas une preuve : il signale un comportement à vérifier. Les poids de fusion ont été choisis sur des
          données simulées et doivent être recalibrés sur le pilote.
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 text-sm">
          <span>
            Service ML :{' '}
            <strong className={mlService?.status === 'ok' ? 'text-emerald-700' : 'text-rose-700'}>{mlService?.status ?? '…'}</strong>
            {mlService?.modeles && <span className="text-slate-500"> — navigateur : {mlService.modeles.browser}, webcam : {mlService.modeles.webcam}, poids webcam {mlService.fusion?.w_webcam}</span>}
          </span>
          <span className="flex gap-2">
            {(['all', 'alerts', 'pending'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1.5 font-semibold ${filter === f ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                {{ all: 'Toutes', alerts: 'Alertes', pending: 'À examiner' }[f]}
              </button>
            ))}
          </span>
        </div>
        {notice && <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</div>}
        {loading && <p className="text-slate-500">Chargement…</p>}
        {!loading && shown.length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">Aucune copie surveillée pour ce filtre.</div>}

        {shown.map((r) => {
          const nav = r.details.navigateur;
          const cam = r.details.webcam;
          const ind = nav?.indicateurs || {};
          const warnings = [...(nav?.prediction?.hors_domaine || []), ...(cam?.hors_domaine || [])];
          return (
            <article key={r.id} className={`space-y-5 rounded-2xl border bg-white p-6 shadow-sm ${r.alert ? 'border-rose-300' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{r.submission.exam.title}</h2>
                  <p className="text-sm text-slate-500">
                    {r.submission.user.name} · {r.submission.user.email} · remis le {new Date(r.submission.submittedAt).toLocaleString()} · note {r.submission.score} / {r.submission.totalScore}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${r.alert ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'}`}>{r.alert ? 'ALERTE' : 'Pas d’alerte'}</span>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status]}</span>
                </div>
              </div>

              {r.mlStatus !== 'OK' ? (
                <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Service ML indisponible lors de la remise ({r.mlStatus}) : aucun score calculé. {r.details.erreur}</p>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Score fusionné</p><p className="text-2xl font-black">{pct(r.fusedScore)}</p><p className="text-xs text-slate-400">{r.fusionMode}{r.threshold != null ? ` · seuil ${pct(r.threshold)}` : ''}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Navigateur (session)</p><p className="text-2xl font-black">{pct(r.browserScore)}</p><p className="text-xs text-slate-400">ramené à 5 % de prévalence</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Webcam (moyenne)</p><p className="text-2xl font-black">{r.consentWebcam ? pct(r.webcamScore) : 'refusée'}</p><p className="text-xs text-slate-400">{r.webcamFrames} relevés{cam ? ` · ${pct(cam.part_images_en_alerte)} au-dessus du seuil` : ''}</p></div>
                    <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Session</p><p className="text-sm">{String(ind.tot_que_attempted ?? '—')} / {String(ind.tot_question ?? '—')} répondues</p><p className="text-sm">{String(ind.que_att_within_idl_time ?? '—')} en ≤ 180 s ({String(ind.idl_time_correct_que ?? '—')} justes)</p><p className="text-xs text-slate-400">durée {Math.round(Number(ind.exam_finish_time_in_sec ?? 0))} s</p></div>
                  </div>
                  {cam?.chronologie && (
                    <div>
                      <p className="text-sm font-bold text-slate-800">Chronologie du risque webcam</p>
                      <Timeline values={cam.chronologie} />
                    </div>
                  )}
                  <div className="grid gap-6 md:grid-cols-2">
                    <Reasons title="Pourquoi ? — session / navigateur" explanation={nav?.explication} />
                    <Reasons title="Pourquoi ? — webcam (relevé le plus suspect)" explanation={cam?.image_la_plus_suspecte?.explication} />
                  </div>
                  {warnings.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">⚠ Hors du domaine d&apos;entraînement (prédiction moins fiable) : {Array.from(new Set(warnings)).join(' ; ')}</p>}
                </>
              )}

              <div>
                <p className="text-sm font-bold text-slate-800">Événements navigateur <span className="font-normal text-slate-500">(règles affichées, pas de modèle appris)</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.keys(EVENT_LABEL).map((k) => (
                    <span key={k} className={`rounded-lg px-3 py-1 text-xs ${(r.browserEvents[k] || 0) > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>
                      {EVENT_LABEL[k]} : {r.browserEvents[k] ?? 0}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t pt-4">
                <textarea value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} rows={2} placeholder="Note de décision (visible dans le journal d'audit)" className="w-full rounded-lg border px-3 py-2 text-sm" />
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => decide(r, 'CONFIRMED')} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white">Confirmer l&apos;alerte</button>
                  <button onClick={() => decide(r, 'REJECTED')} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Rejeter</button>
                  <button onClick={() => decide(r, 'REVIEW')} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Demander une revue</button>
                  {r.decidedAt && <span className="text-xs text-slate-500">Décision du {new Date(r.decidedAt).toLocaleString()}</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
