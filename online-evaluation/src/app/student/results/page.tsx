'use client';

import { useEffect, useState } from 'react';
import type { StudentResultView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, PageHeader, ProgressRing } from '@/components/ui/kit';

export default function ResultsPage() {
  useRoleGuard('STUDENT');
  const [submissions, setSubmissions] = useState<StudentResultView[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    fetch('/api/student/results').then(async (r) => { const data = await r.json(); if (r.ok) setSubmissions(data.submissions); }).finally(() => setLoading(false));
  }, []);

  return (
    <AppShell role="STUDENT" active="results">
      <PageHeader eyebrow="Apprentissage" title="Résultats & retours" subtitle="Vos examens remis, vos notes et les commentaires de vos enseignants." />
      {loading ? <div className="eg-card h-28 animate-pulse bg-slate-100/60" /> : submissions.length === 0 ? (
        <EmptyState icon="chart" title="Aucun examen remis" text="Vos résultats apparaîtront ici après votre premier examen." />
      ) : (
        <div className="space-y-3">
          {submissions.map((sub) => {
            const ratio = sub.totalScore > 0 ? sub.score / sub.totalScore : 0;
            const graded = sub.status === 'GRADED';
            const open = openId === sub.id;
            return (
              <article key={sub.id} className="eg-card overflow-hidden">
                <button onClick={() => setOpenId(open ? null : sub.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-start">
                  <ProgressRing value={graded ? ratio : 0} size={52} stroke={6} color={ratio >= 0.5 ? '#10b981' : '#f59e0b'}>
                    <span className="text-xs">{graded ? `${Math.round(100 * ratio)}%` : '…'}</span>
                  </ProgressRing>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{sub.exam.title}</p>
                    <p className="text-xs text-slate-500">Remis le {new Date(sub.submittedAt).toLocaleString('fr-FR')}</p>
                  </div>
                  <span className={`eg-badge ${graded ? 'eg-badge-green' : 'eg-badge-amber'}`}>{graded ? 'Noté' : 'En correction'}</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{sub.score} / {sub.totalScore}</span>
                  <Icon name="chevronDown" className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
                    {sub.feedback && <p className="eg-alert eg-alert-info font-normal"><strong>Retour de l’enseignant :</strong> {sub.feedback}</p>}
                    {sub.answers.map((a, i) => {
                      const full = a.score >= a.question.points;
                      return (
                        <div key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-slate-900"><span className="me-2 text-slate-400">Q{i + 1}.</span>{a.question.text}</p>
                            <span className={`eg-badge ${full ? 'eg-badge-green' : a.score > 0 ? 'eg-badge-amber' : 'eg-badge-slate'}`}>{a.score} / {a.question.points}</span>
                          </div>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {a.question.imageUrl && <img src={a.question.imageUrl} alt="Illustration" className="mt-3 max-h-40 rounded-lg object-contain" />}
                          {a.textResponse !== null
                            ? <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{a.textResponse || 'Pas de réponse'}</p>
                            : <p className="mt-2 text-sm text-slate-600">Votre réponse : <strong className="text-slate-900">{a.selectedOption?.text || 'Pas de réponse'}</strong></p>}
                          {graded && a.question.options && a.question.options.length > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" />Bonne réponse : {a.question.options.filter((o) => o.isCorrect).map((o) => o.text).join(', ')}</p>}
                          {a.feedback && <p className="mt-2 text-sm text-slate-600"><span className="font-medium">Commentaire :</span> {a.feedback}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
