'use client';

import { useEffect, useState } from 'react';
import type { BadgeView, GradingSubmissionView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const TEACHER_NAV = [
  { href: '/teacher/profile', icon: '👤', label: 'Manage Profile', color: 'sky' as const },
  { href: '/teacher/home', icon: '📝', label: 'My Exams', color: 'emerald' as const },
  { href: '/teacher/classes', icon: '🏛️', label: 'My Classes', color: 'amber' as const },
  { href: '/teacher/grading', icon: '✍️', label: 'Grading Center', color: 'violet' as const },
];

export default function GradingPage() {
  useRoleGuard('TEACHER');
  const t = useT();
  const [submissions, setSubmissions] = useState<GradingSubmissionView[]>([]);
  const [badges, setBadges] = useState<Array<Pick<BadgeView, 'id' | 'name' | 'imageUrl'>>>([]);
  const [selectedBadge, setSelectedBadge] = useState<Record<string, string>>({});
  const [grades, setGrades] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'graded'>('pending');
  const [gradingModalSub, setGradingModalSub] = useState<GradingSubmissionView | null>(null);

  const refresh = async () => {
    const res = await fetch('/api/teacher/submissions');
    const data = await res.json();
    if (res.ok) {
      setSubmissions(data.submissions);
      setBadges(data.badges || []);
      const next: Record<string, number> = {};
      const notes: Record<string, string> = {};
      for (const sub of data.submissions) {
        for (const a of sub.answers) {
          next[a.id] = a.score;
          notes[a.id] = a.feedback || '';
        }
      }
      setGrades(next);
      setFeedback(notes);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async (submission: GradingSubmissionView) => {
    const res = await fetch('/api/teacher/submissions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        submissionId: submission.id,
        badgeId: selectedBadge[submission.id] || undefined,
        answers: submission.answers.map(a => ({
          id: a.id,
          score: grades[a.id] ?? a.score,
          feedback: feedback[a.id] || '',
        })),
      }),
    });
    const data = await res.json();
    setNotice(res.ok ? `Saved grade: ${data.submission.score} / ${data.submission.totalScore}` : data.error || 'Could not save grade');
    setGradingModalSub(null);
    refresh();
  };

  const pendingSubmissions = submissions.filter(s => s.status !== 'GRADED');
  const gradedSubmissions = submissions.filter(s => s.status === 'GRADED');
  const displayList = activeTab === 'pending' ? pendingSubmissions : gradedSubmissions;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <WorkspaceSidebar title="Teacher Studio" accent="emerald" items={TEACHER_NAV} />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-7">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-5">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">{t('Grading Center')}</h1>
            <p className="text-slate-500">{t('Review submissions, score written responses, and return feedback.')}</p>
          </div>
          <div className="flex rounded-xl bg-slate-200/70 p-1">
            <button
              onClick={() => setActiveTab('pending')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === 'pending' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t('Pending Submissions')} ({pendingSubmissions.length})
            </button>
            <button
              onClick={() => setActiveTab('graded')}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${activeTab === 'graded' ? 'bg-white shadow text-slate-900' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {t('Graded History')} ({gradedSubmissions.length})
            </button>
          </div>
        </header>

        {notice && (
          <div className="flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-emerald-800 shadow-sm">
            <span><DynamicText text={notice} /></span>
            <button onClick={() => setNotice('')} className="text-sm font-bold text-emerald-700 hover:text-emerald-900">✕</button>
          </div>
        )}

        {displayList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-500 shadow-sm">
            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-slate-700">{t('No submissions found')}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {activeTab === 'pending' ? t('No student submissions are currently waiting for grading.') : t('No graded submissions history available yet.')}
            </p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {displayList.map(sub => (
              <article key={sub.id} className="flex flex-col justify-between rounded-2xl border bg-white p-6 shadow-sm transition hover:shadow-md">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sub.status === 'GRADED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {t(sub.status)}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(sub.submittedAt).toLocaleDateString()}</span>
                  </div>
                  <h2 className="mt-3 text-lg font-bold text-slate-800 line-clamp-1"><DynamicText text={sub.exam.title} /></h2>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <p className="font-medium text-slate-900">{sub.user.name}</p>
                    <p className="text-xs text-slate-500 truncate">{sub.user.email}</p>
                  </div>
                  <div className="mt-4 border-t pt-3 text-xs text-slate-500 flex justify-between items-center">
                    <span>{t('Questions answered:')} {sub.answers.length}</span>
                    <span className="font-medium text-slate-700">{t('Passing:')} {sub.exam.passingScore}%</span>
                  </div>
                </div>

                <div className="mt-6 border-t pt-4">
                  <button
                    onClick={() => setGradingModalSub(sub)}
                    className="w-full rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-800"
                  >
                    {sub.status === 'GRADED' ? t('Review & Edit Grade') : t('Grade Submission')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {/* Grading Modal / View */}
        {gradingModalSub && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm overflow-y-auto">
            <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 md:p-8 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-4">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{t('Grading Student Exam')}</span>
                  <h2 className="text-2xl font-bold text-slate-900"><DynamicText text={gradingModalSub.exam.title} /></h2>
                  <p className="text-sm text-slate-500">{t('Student:')} {gradingModalSub.user.name} ({gradingModalSub.user.email}) · {t('Submitted')} {new Date(gradingModalSub.submittedAt).toLocaleString()}</p>
                </div>
                <button
                  onClick={() => setGradingModalSub(null)}
                  className="rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                >
                  ✕
                </button>
              </div>

              <div className="mt-6 space-y-6">
                {gradingModalSub.answers.map((a, index) => (
                  <div key={a.id} className="rounded-2xl border bg-slate-50/50 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                      <span className="text-sm font-semibold text-slate-700">{t('Question')} {index + 1}: <DynamicText text={a.question.text} /></span>
                      <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-bold text-slate-700">{t('Max')} {a.question.points} {t('pts')} ({t(a.question.questionType)})</span>
                    </div>

                    {a.question.imageUrl && (
                      <div className="my-2">
                        <img src={a.question.imageUrl} alt="Question illustration" className="max-h-48 rounded-lg object-contain border bg-white" />
                      </div>
                    )}

                    <div className="rounded-xl bg-white p-4 border shadow-sm">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400">{t('Student Response')}</span>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 font-medium">
                        {a.textResponse ? <DynamicText text={a.textResponse} /> : a.selectedOption?.text ? <DynamicText text={a.selectedOption.text} /> : <span className="italic text-slate-400">{t('No answer provided')}</span>}
                      </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-[160px_1fr] pt-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Score')} (0 - {a.question.points})</label>
                        <input
                          type="number"
                          min={0}
                          max={a.question.points}
                          step="0.5"
                          value={grades[a.id] ?? 0}
                          onChange={e => setGrades({ ...grades, [a.id]: Number(e.target.value) })}
                          className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                          aria-label="Score"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">{t('Feedback Comment')}</label>
                        <input
                          value={feedback[a.id] ?? ''}
                          onChange={e => setFeedback({ ...feedback, [a.id]: e.target.value })}
                          placeholder={t('Provide specific feedback or explanation for this answer...')}
                          className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
                <div className="flex items-center gap-3">
                  {badges.length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedBadge[gradingModalSub.id] || ''}
                        onChange={e => setSelectedBadge({ ...selectedBadge, [gradingModalSub.id]: e.target.value })}
                        className="rounded-xl border bg-white px-3 py-2.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      >
                        <option value="">{t('Award Badge (Optional)')}</option>
                        {badges.map(b => (
                          <option key={b.id} value={b.id}>{t(b.name)}</option>
                        ))}
                      </select>
                      {badges.find(b => b.id === selectedBadge[gradingModalSub.id])?.imageUrl && (
                        <img src={badges.find(b => b.id === selectedBadge[gradingModalSub.id])?.imageUrl || ''} alt="Badge" className="h-10 w-10 rounded-full object-cover border" />
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setGradingModalSub(null)}
                    className="rounded-xl border bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm hover:bg-slate-50 transition"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    onClick={() => save(gradingModalSub)}
                    className="rounded-xl bg-emerald-700 px-6 py-2.5 text-sm font-semibold text-white shadow transition hover:bg-emerald-800"
                  >
                    {t('Save & Return Final Grade')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      </main>
    </div>
  );
}
