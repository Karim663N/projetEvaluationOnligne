'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BadgeView, GradingSubmissionView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';

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
  const refresh = async () => { const res = await fetch('/api/teacher/submissions'); const data = await res.json(); if (res.ok) { setSubmissions(data.submissions); setBadges(data.badges || []); const next: Record<string, number> = {}; const notes: Record<string, string> = {}; for (const sub of data.submissions) for (const a of sub.answers) { next[a.id] = a.score; notes[a.id] = a.feedback || ''; } setGrades(next); setFeedback(notes); } };
  useEffect(() => { refresh(); }, []);
  const createBadge = async (event: React.FormEvent) => { event.preventDefault(); const res = await fetch('/api/teacher/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: badgeName, imageUrl: badgeImage || null }) }); const data = await res.json(); setNotice(res.ok ? 'Badge created and ready to award.' : data.error || 'Could not create badge'); if (res.ok) { setBadgeName(''); setBadgeImage(''); refresh(); } };
  const uploadBadgeImage = async (file?: File) => { if (!file) return; const form = new FormData(); form.set('file', file); const res = await fetch('/api/uploads/images', { method: 'POST', body: form }); const data = await res.json(); if (res.ok) setBadgeImage(data.url); else setNotice(data.error || 'Image upload failed'); };
  const save = async (submission: GradingSubmissionView) => {
    const res = await fetch('/api/teacher/submissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ submissionId: submission.id, badgeId: selectedBadge[submission.id] || undefined, answers: submission.answers.map(a => ({ id: a.id, score: grades[a.id] ?? a.score, feedback: feedback[a.id] || '' })) }) });
    const data = await res.json(); setNotice(res.ok ? `Saved grade: ${data.submission.score} / ${data.submission.totalScore}` : data.error || 'Could not save grade'); refresh();
  };
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900"><div className="mx-auto max-w-5xl space-y-7">
    <header><Link href="/teacher/home" className="text-sm text-emerald-700">← Teacher workspace</Link><h1 className="mt-2 text-3xl font-bold">Grading center</h1><p className="text-slate-500">Review submissions, score written responses, and return feedback.</p></header>
    {notice && <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">{notice}</div>}
    <form onSubmit={createBadge} className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><div><label className="mb-1 block text-sm font-semibold">Create badge for grading</label><input required minLength={2} value={badgeName} onChange={e => setBadgeName(e.target.value)} placeholder="Badge name" className="rounded-lg border px-3 py-2"/></div><label className="text-sm">Badge image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => uploadBadgeImage(e.target.files?.[0])} className="mt-1 block max-w-56 text-xs"/></label>{badgeImage && <img src={badgeImage} alt="Badge preview" className="h-10 w-10 rounded-full object-cover"/>}<button className="rounded-lg bg-amber-500 px-4 py-2 font-semibold text-white">Create badge</button></form>
    {submissions.filter(s => s.status !== 'GRADED').length === 0 && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No submissions are waiting for grading.</div>}
    <div className="space-y-5">{submissions.filter(s => s.status !== 'GRADED').map(sub => <article key={sub.id} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-xl font-bold">{sub.exam.title}</h2><p className="text-sm text-slate-500">{sub.user.name} · {sub.user.email} · Submitted {new Date(sub.submittedAt).toLocaleString()}</p></div><span className="h-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{sub.status}</span></div>
      <div className="mt-5 space-y-4">{sub.answers.map(a => <div key={a.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{a.question.text}</strong><span className="text-xs text-slate-500">Max {a.question.points} pts</span></div>{a.question.imageUrl && <img src={a.question.imageUrl} alt="Question illustration" className="mt-3 max-h-48 rounded object-contain"/>}<p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{a.textResponse || a.selectedOption?.text || 'No answer provided'}</p><div className="mt-3 grid gap-3 md:grid-cols-[130px_1fr]"><input type="number" min={0} max={a.question.points} step="0.5" value={grades[a.id] ?? 0} onChange={e => setGrades({ ...grades, [a.id]: Number(e.target.value) })} className="rounded-lg border px-3 py-2" aria-label="Score"/><input value={feedback[a.id] ?? ''} onChange={e => setFeedback({ ...feedback, [a.id]: e.target.value })} placeholder="Feedback for student" className="rounded-lg border px-3 py-2"/></div></div>)}</div>
      <div className="mt-5 flex flex-wrap items-center gap-3">{badges.length > 0 && <><select value={selectedBadge[sub.id] || ''} onChange={e => setSelectedBadge({ ...selectedBadge, [sub.id]: e.target.value })} className="rounded-lg border bg-white px-3 py-2"><option value="">No badge</option>{badges.map(b => <option key={b.id} value={b.id}>Award: {b.name}</option>)}</select>{badges.find(b => b.id === selectedBadge[sub.id])?.imageUrl && <img src={badges.find(b => b.id === selectedBadge[sub.id])?.imageUrl || ''} alt="Selected badge" className="h-10 w-10 rounded-full object-cover"/>}</>}<button onClick={() => save(sub)} className="rounded-lg bg-emerald-700 px-5 py-2.5 font-semibold text-white">Save and return grade</button></div></article>)}</div>
  </div></main>;
}
