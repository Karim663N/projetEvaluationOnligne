'use client';

import { useEffect, useState } from 'react';
import type { BadgeView, GradingSubmissionView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, PageHeader } from '@/components/ui/kit';

export default function GradingPage() {
  useRoleGuard('TEACHER');
  const [submissions, setSubmissions] = useState<GradingSubmissionView[]>([]);
  const [badges, setBadges] = useState<Array<Pick<BadgeView, 'id' | 'name' | 'imageUrl'>>>([]);
  const [badgeName, setBadgeName] = useState('');
  const [badgeImage, setBadgeImage] = useState('');
  const [selectedBadge, setSelectedBadge] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const refresh = async () => {
    const res = await fetch('/api/teacher/submissions');
    const data = await res.json();
    if (!res.ok) return;
    setSubmissions(data.submissions);
    setBadges(data.badges || []);
    const next: Record<string, number> = {}; const notes: Record<string, string> = {};
    for (const sub of data.submissions) for (const a of sub.answers) { next[a.id] = a.score; notes[a.id] = a.feedback || ''; }
    setGrades(next); setFeedback(notes);
    setOpenId((prev) => prev ?? (data.submissions as GradingSubmissionView[]).find((s) => s.status !== 'GRADED')?.id ?? null);
  };
  useEffect(() => { refresh(); }, []);

  const createBadge = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/teacher/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: badgeName, imageUrl: badgeImage || null }) });
    const data = await res.json();
    setNotice(res.ok ? 'Badge créé, prêt à être attribué.' : data.error || 'Création du badge impossible');
    if (res.ok) { setBadgeName(''); setBadgeImage(''); refresh(); }
  };
  const uploadBadgeImage = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    const res = await fetch('/api/uploads/images', { method: 'POST', body: form }); const data = await res.json();
    if (res.ok) setBadgeImage(data.url); else setNotice(data.error || 'Import de l’image impossible');
  };
  const save = async (submission: GradingSubmissionView) => {
    const res = await fetch('/api/teacher/submissions', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId: submission.id, badgeId: selectedBadge[submission.id] || undefined, answers: submission.answers.map((a) => ({ id: a.id, score: grades[a.id] ?? a.score, feedback: feedback[a.id] || '' })) }),
    });
    const data = await res.json();
    setNotice(res.ok ? `Note enregistrée : ${data.submission.score} / ${data.submission.totalScore} — ${submission.user.name}.` : data.error || 'Enregistrement impossible');
    // copie suivante a corriger
    if (res.ok) setOpenId(queue.find((s) => s.id !== submission.id)?.id ?? null);
    refresh();
  };

  const queue = submissions.filter((s) => s.status !== 'GRADED');

  return (
    <AppShell role="TEACHER" active="grading">
      <PageHeader eyebrow="Enseignement" title="Correction" subtitle="Notez les réponses rédigées, laissez un retour et attribuez un badge si vous le souhaitez." />

      {notice && <div className="eg-alert eg-alert-success mb-5 flex items-center justify-between gap-3">{notice}<button onClick={() => setNotice('')} aria-label="Fermer"><Icon name="x" className="h-4 w-4" /></button></div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-3">
          <p className="text-sm text-slate-500"><strong className="text-slate-900">{queue.length}</strong> copie{queue.length > 1 ? 's' : ''} à corriger</p>
          {queue.length === 0 && <EmptyState icon="check" title="Tout est corrigé" text="Aucune copie n’attend de correction pour l’instant." />}
          {queue.map((sub) => {
            const open = openId === sub.id;
            const max = sub.answers.reduce((s, a) => s + a.question.points, 0);
            const current = sub.answers.reduce((s, a) => s + (grades[a.id] ?? a.score), 0);
            return (
              <article key={sub.id} className={`eg-card overflow-hidden ${open ? 'ring-brand-200' : ''}`}>
                <button onClick={() => setOpenId(open ? null : sub.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 px-5 py-4 text-start">
                  <Avatar name={sub.user.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">{sub.exam.title}</p>
                    <p className="truncate text-xs text-slate-500">{sub.user.name} · remis le {new Date(sub.submittedAt).toLocaleString('fr-FR')}</p>
                  </div>
                  <span className="eg-badge eg-badge-amber">À corriger</span>
                  <span className="text-sm font-semibold tabular-nums text-slate-700">{current} / {max}</span>
                  <Icon name="chevronDown" className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
                </button>
                {open && (
                  <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 p-5">
                    {sub.answers.map((a, i) => (
                      <div key={a.id} className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900"><span className="me-2 text-slate-400">Q{i + 1}.</span>{a.question.text}</p>
                          <span className="eg-badge eg-badge-slate">{a.question.points} pt{a.question.points > 1 ? 's' : ''}</span>
                        </div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {a.question.imageUrl && <img src={a.question.imageUrl} alt="Illustration" className="mt-3 max-h-40 rounded-lg object-contain" />}
                        <p className="mt-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{a.textResponse || a.selectedOption?.text || <span className="italic text-slate-400">Pas de réponse</span>}</p>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
                          <label><span className="eg-label">Note</span>
                            <div className="flex items-center gap-2"><input type="number" min={0} max={a.question.points} step="0.5" value={grades[a.id] ?? 0} onChange={(e) => setGrades({ ...grades, [a.id]: Number(e.target.value) })} className="eg-input" aria-label="Note" /><span className="text-sm text-slate-400">/ {a.question.points}</span></div>
                          </label>
                          <label><span className="eg-label">Retour à l’étudiant</span><input value={feedback[a.id] ?? ''} onChange={(e) => setFeedback({ ...feedback, [a.id]: e.target.value })} placeholder="Facultatif" className="eg-input" /></label>
                        </div>
                      </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {badges.length > 0 && (
                        <select value={selectedBadge[sub.id] || ''} onChange={(e) => setSelectedBadge({ ...selectedBadge, [sub.id]: e.target.value })} className="eg-input w-56">
                          <option value="">Sans badge</option>
                          {badges.map((b) => <option key={b.id} value={b.id}>Attribuer : {b.name}</option>)}
                        </select>
                      )}
                      <button onClick={() => save(sub)} className="eg-btn eg-btn-primary ms-auto"><Icon name="check" className="h-4 w-4" />Enregistrer et rendre la note</button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>

        <form onSubmit={createBadge} className="eg-card h-fit space-y-4 p-5">
          <p className="eg-h2 flex items-center gap-2"><Icon name="award" className="h-4 w-4 text-amber-500" />Badge de correction</p>
          <label className="block"><span className="eg-label">Nom du badge</span><input required minLength={2} value={badgeName} onChange={(e) => setBadgeName(e.target.value)} placeholder="Ex. : Excellente rédaction" className="eg-input" /></label>
          <label className="block"><span className="eg-label">Image</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => uploadBadgeImage(e.target.files?.[0])} className="eg-file" /></label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {badgeImage && <img src={badgeImage} alt="Aperçu" className="h-12 w-12 rounded-full object-cover" />}
          <button className="eg-btn eg-btn-secondary w-full">Créer le badge</button>
        </form>
      </div>
    </AppShell>
  );
}
