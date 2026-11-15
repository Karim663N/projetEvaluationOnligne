'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { StudentResultView } from '@/lib/types';

export default function ResultsPage() {
  const [submissions, setSubmissions] = useState<StudentResultView[]>([]);
  useEffect(() => { fetch('/api/student/results').then(async r => { const data = await r.json(); if (r.ok) setSubmissions(data.submissions); }); }, []);
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900"><div className="mx-auto max-w-5xl space-y-7"><header><Link href="/student/home" className="text-sm text-blue-700">← Student dashboard</Link><h1 className="mt-2 text-3xl font-bold">Results & feedback</h1><p className="text-slate-500">Review your completed exams and teacher feedback.</p></header>
    {!submissions.length && <div className="rounded-2xl border bg-white p-8 text-center text-slate-500">No submitted exams yet.</div>}
    <div className="space-y-5">{submissions.map(sub => <article key={sub.id} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-bold">{sub.exam.title}</h2><p className="text-sm text-slate-500">Submitted {new Date(sub.submittedAt).toLocaleString()}</p></div><div className="text-right"><span className="font-bold text-blue-700">{sub.score} / {sub.totalScore}</span><p className="text-xs text-slate-500">{sub.status === 'GRADED' ? 'Graded' : 'Awaiting teacher review'}</p></div></div>{sub.feedback && <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">{sub.feedback}</p>}<div className="mt-5 space-y-3">{sub.answers.map(a => <div key={a.id} className="rounded-xl border p-4"><p className="font-semibold">{a.question.text}</p>{a.question.imageUrl && <img src={a.question.imageUrl} alt="Question illustration" className="mt-3 max-h-48 rounded object-contain"/>}{a.textResponse !== null ? <p className="mt-2 whitespace-pre-wrap text-sm">{a.textResponse || 'No response provided'}</p> : <p className="mt-2 text-sm">Your answer: <strong>{a.selectedOption?.text || 'No answer'}</strong></p>}{sub.status === 'GRADED' && a.question.options && a.question.options.length > 0 && <p className="mt-2 text-xs text-emerald-700">Correct answer: {a.question.options.filter(o => o.isCorrect).map(o => o.text).join(', ')}</p>}{a.feedback && <p className="mt-2 text-sm text-slate-600">Feedback: {a.feedback}</p>}<p className="mt-2 text-xs font-semibold text-slate-500">Score: {a.score} / {a.question.points}</p></div>)}</div></article>)}</div>
  </div></main>;
}
