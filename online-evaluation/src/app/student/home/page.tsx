'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ClassView, ExamView, StudentProfileView, StudentSubmissionView } from '@/lib/types';
import { translations, Language } from '@/lib/i18n';
import { useRoleGuard, useSetLang, useLang, useT, DynamicText } from '@/lib';
import CvAnalysisSections from '@/components/CvAnalysisSections';

// Loose shape used only to render questions; adjust to match your ExamView type.
interface ExamQuestionLike {
  id: string;
  text?: string;
  content?: string;
  prompt?: string;
  type?: string;
  questionType?: string;
  imageUrl?: string | null;
  options?: Array<string | { id?: string; text?: string; imageUrl?: string | null }>;
}

export default function StudentHome() {
  useRoleGuard('STUDENT');
  const router = useRouter();
  const setLang = useSetLang();
  const lang = useLang();
  const t = useT();

  const [exams, setExams] = useState<ExamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'exams' | 'profile' | 'classes' | 'cv'>('exams');

  // Exam taking
  const [activeExam, setActiveExam] = useState<ExamView | null>(null);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [questionId: string]: string }>({});
  const [essayAnswers, setEssayAnswers] = useState<{ [questionId: string]: string }>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const submitExamRef = useRef<(skipConfirm?: boolean) => void>(() => {});
  const autoSubmitStarted = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Pick<StudentSubmissionView, 'id' | 'score' | 'totalScore' | 'status' | 'submittedAt'> | null>(null);

  // Classes
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [joinCode, setJoinCode] = useState('');
  const [classMessage, setClassMessage] = useState('');

  // Profile
  const [profileData, setProfileData] = useState<StudentProfileView>({ badges: [], certificates: [], submissions: [] });
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileUploadMessage, setProfileUploadMessage] = useState('');

  // CV
  const [cvUrl, setCvUrl] = useState<string | null>(null);
  const [cvAnalysis, setCvAnalysis] = useState<string | null>(null);
  const [analyzingCv, setAnalyzingCv] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');

  useEffect(() => {
    fetchExams();
    fetchProfile();
    fetchClasses();
    const savedLang = localStorage.getItem('app_lang') as Language;
    if (savedLang && translations[savedLang]) setLang(savedLang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Exam countdown + auto-submit
  useEffect(() => {
    if (!activeExam || result) return;
    autoSubmitStarted.current = false;
    const end = Date.now() + (activeExam.duration || 0) * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !autoSubmitStarted.current) {
        autoSubmitStarted.current = true;
        submitExamRef.current(true);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [activeExam, result]);

  const changeLanguage = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (res.ok) setExams(data.exams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      if (res.ok) setClasses(data.classes || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setClassMessage('');
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ joinCode }),
    });
    const data = await res.json();
    setClassMessage(
      res.ok
        ? data.enrollment.status === 'APPROVED'
          ? 'You are already enrolled in this class.'
          : 'Join request sent. Your teacher will review it.'
        : data.error || 'Could not join class'
    );
    if (res.ok) {
      setJoinCode('');
      fetchClasses();
    }
  };

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/student/profile');
      const data = await res.json();
      if (res.ok) {
        setProfileData(data);
        setProfileName(data.user?.name || '');
        setProfileEmail(data.user?.email || '');
        setAvatarUrl(data.user?.avatarUrl || '');
        const cv = await fetch('/api/student/cv?meta=1');
        if (cv.ok) setCvUrl((await cv.json()).cvUrl || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    const res = await fetch('/api/user/avatar', { method: 'POST', body: form });
    const data = await res.json();
    setProfileUploadMessage(res.ok ? 'Profile picture uploaded.' : data.error || 'Could not upload profile picture');
    if (res.ok) setAvatarUrl(data.avatarUrl);
  };

  const uploadCv = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    try {
      const res = await fetch('/api/student/cv', { method: 'POST', body: form });
      const data = await res.json();
      if (res.ok) {
        setProfileUploadMessage(
          data.warning === 'no_text_extracted'
            ? 'CV uploaded, but no text could be extracted (scanned PDF?). AI analysis needs a text-based PDF.'
            : 'CV uploaded successfully.'
        );
        setCvUrl(data.cvUrl);
        setCvAnalysis(null);
        setCvError(null);
      } else {
        setProfileUploadMessage(data.error || 'Could not upload CV');
      }
    } catch (err) {
      console.error(err);
      setProfileUploadMessage('Could not upload CV');
    }
  };

  const handleEnhanceCv = async () => {
    setAnalyzingCv(true);
    setCvError(null);
    setCvAnalysis(null);
    setCopyStatus('idle');

    let message = t('An error occurred during analysis.');
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/student/cv/enhance', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setCvAnalysis(data.text);
          setAnalyzingCv(false);
          return;
        }
        message = data.error || t('An error occurred during analysis.');
        // Client errors (no CV, unreadable PDF...) will not succeed on retry
        if (res.status < 500) break;
      } catch (err: unknown) {
        message = (err as Error).message || t('An error occurred during analysis.');
      }
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    }
    setCvError(message);
    setAnalyzingCv(false);
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch {
      setCopyStatus('idle');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMessage('');
    const res = await fetch('/api/student/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: profileName, email: profileEmail, avatarUrl, currentPassword, newPassword }),
    });
    const data = await res.json();
    setProfileMessage(res.ok ? 'Profile updated.' : data.error || 'Could not update profile');
    if (res.ok) {
      setProfileData({ ...profileData, user: data.user });
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  const handleStartExam = async (examId: string) => {
    try {
      const attemptRes = await fetch(`/api/exams/${examId}/attempt`);
      const attemptData = await attemptRes.json();
      if (!attemptRes.ok) {
        alert(attemptData.error || 'Could not start the exam');
        return;
      }
      const res = await fetch(`/api/exams/${examId}`);
      const data = await res.json();
      if (res.ok && data.exam) {
        setActiveExam(data.exam);
        // Restore any answers already saved for this attempt
        const savedSelected: { [questionId: string]: string } = {};
        const savedEssay: { [questionId: string]: string } = {};
        for (const a of attemptData.answers || []) {
          if (a.textResponse) savedEssay[a.questionId] = a.textResponse;
          else if (a.selectedOptionId) savedSelected[a.questionId] = a.selectedOptionId;
        }
        setSelectedAnswers(savedSelected);
        setEssayAnswers(savedEssay);
        setQuestionIndex(0);
        setSubmitting(false);
        setResult(null);
      } else {
        alert(data.error || 'Could not load the exam');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const submitExam = async (skipConfirm = false) => {
    if (submitting || !activeExam?.id) return;
    const payloadAnswers = [
      ...Object.entries(selectedAnswers).map(([questionId, selectedOptionId]) => ({ questionId, selectedOptionId })),
      ...Object.entries(essayAnswers).map(([questionId, textResponse]) => ({ questionId, textResponse })),
    ];
    if (!payloadAnswers.length) {
      alert(t('Please answer at least one question before submitting.'));
      return;
    }
    // Manual submit asks for confirmation; timer auto-submit skips it
    if (!skipConfirm && !window.confirm(t('Submit your exam? You will not be able to change your answers afterwards.'))) {
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/exams/${activeExam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: payloadAnswers }),
      });
      const data = await res.json();
      if (res.ok && data.submission) {
        setResult(data.submission);
        setSubmitting(false);
      } else {
        setSubmitting(false);
        alert(data.error || 'Submit failed');
      }
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };
  submitExamRef.current = submitExam;

  const closeExam = () => {
    setActiveExam(null);
    setResult(null);
    fetchExams();
    fetchProfile();
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      console.error(err);
    }
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  // ---------- Exam taking screen ----------
  if (activeExam) {
    const questions = ((activeExam as unknown as { questions?: ExamQuestionLike[] }).questions || []);
    return (
      <div className="min-h-screen bg-slate-50 p-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div>
              <h2 className="text-2xl font-black text-slate-900"><DynamicText text={activeExam.title} /></h2>
              <p className="text-sm text-slate-500">{activeExam.description ? <DynamicText text={activeExam.description} /> : null}</p>
            </div>
            {!result && (
              <div className={`rounded-xl px-4 py-2 font-mono text-xl font-bold ${secondsLeft <= 60 ? 'bg-rose-100 text-rose-700' : 'bg-blue-50 text-blue-700'}`}>
                ⏱ {formatTime(secondsLeft)}
              </div>
            )}
          </div>

          {result ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm space-y-4">
              <h3 className="text-2xl font-black text-slate-900">{t('Exam submitted')}</h3>
              <p className="text-4xl font-black text-emerald-600">
                {result.score} / {result.totalScore}
              </p>
              <p className="text-sm text-slate-500">{t('Status')}: {t(result.status)}</p>
              <button onClick={closeExam} className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700 transition-all">
                {t('Back to dashboard')}
              </button>
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center text-amber-800 font-semibold">
              {t('This exam has no questions yet.')}
            </div>
          ) : (() => {
            const safeIndex = Math.min(questionIndex, questions.length - 1);
            const q = questions[safeIndex];
            const label = q.text || q.content || q.prompt || '';
            const isEssay = q.questionType === 'TEXT_ESSAY' || q.type === 'ESSAY' || !q.options || q.options.length === 0;
            const isAnswered = isEssay ? Boolean((essayAnswers[q.id] || '').trim()) : Boolean(selectedAnswers[q.id]);
            const answeredCount = questions.filter((qq) => {
              const essay = qq.questionType === 'TEXT_ESSAY' || qq.type === 'ESSAY' || !qq.options || qq.options.length === 0;
              return essay ? Boolean((essayAnswers[qq.id] || '').trim()) : Boolean(selectedAnswers[qq.id]);
            }).length;
            const progress = Math.round((answeredCount / questions.length) * 100);
            const isLast = safeIndex === questions.length - 1;
            return (
              <div className="space-y-6">
                {/* Progress header */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span className="text-slate-600">{t('Question')} {safeIndex + 1} {t('of')} {questions.length}</span>
                    <span className="text-blue-700">{answeredCount}/{questions.length} {t('answered')}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  {/* Question navigator dots */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {questions.map((qq, i) => {
                      const essay = qq.questionType === 'TEXT_ESSAY' || qq.type === 'ESSAY' || !qq.options || qq.options.length === 0;
                      const done = essay ? Boolean((essayAnswers[qq.id] || '').trim()) : Boolean(selectedAnswers[qq.id]);
                      const current = i === safeIndex;
                      return (
                        <button
                          key={qq.id}
                          type="button"
                          onClick={() => setQuestionIndex(i)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                            current
                              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                              : done
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Current question card */}
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-lg font-bold text-slate-900">
                      {safeIndex + 1}. <DynamicText text={label} />
                    </p>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isAnswered ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {isAnswered ? t('Answered') : t('Not answered')}
                    </span>
                  </div>
                  {q.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.imageUrl} alt={t('Question image')} className="max-h-64 rounded-xl border border-slate-200 object-contain bg-white" />
                  )}
                  {isEssay ? (
                    <textarea
                      value={essayAnswers[q.id] || ''}
                      onChange={(e) => setEssayAnswers({ ...essayAnswers, [q.id]: e.target.value })}
                      rows={8}
                      placeholder={t('Type your answer here...')}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                  ) : (
                    <div className="space-y-2">
                      {q.options!.map((opt, i) => {
                        const value = typeof opt === 'string' ? opt : opt.id || opt.text || String(i);
                        const text = typeof opt === 'string' ? opt : opt.text || value;
                        const selected = selectedAnswers[q.id] === value;
                        const optImage = typeof opt === 'string' ? null : opt.imageUrl || null;
                        return (
                          <label
                            key={value}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                              selected ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name={`q-${q.id}`}
                              value={value}
                              checked={selected}
                              onChange={() => setSelectedAnswers({ ...selectedAnswers, [q.id]: value })}
                              className="h-4 w-4 accent-blue-600"
                            />
                            {optImage && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={optImage} alt={t('Option image')} className="h-12 w-12 shrink-0 rounded-lg border border-slate-200 object-cover bg-white" />
                            )}
                            <span className={selected ? 'font-semibold text-blue-900' : 'text-slate-700'}><DynamicText text={text} /></span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Navigation */}
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setQuestionIndex(Math.max(0, safeIndex - 1))}
                    disabled={safeIndex === 0}
                    className="rounded-xl border border-slate-300 bg-white px-6 py-3 font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    ← {t('Previous')}
                  </button>
                  {isLast ? (
                    <button
                      type="button"
                      onClick={() => void submitExam()}
                      disabled={submitting}
                      className="rounded-xl bg-emerald-600 px-8 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all"
                    >
                      {submitting ? t('Submitting...') : t('Submit exam')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setQuestionIndex(Math.min(questions.length - 1, safeIndex + 1))}
                      className="rounded-xl bg-blue-600 px-8 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
                    >
                      {t('Next')} →
                    </button>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  // ---------- Main portal ----------
  const TAB_COLORS: Record<typeof activeTab, { active: string; hover: string }> = {
    exams: { active: 'bg-blue-600 text-white shadow-md shadow-blue-600/25', hover: 'hover:bg-blue-50 hover:text-blue-700' },
    classes: { active: 'bg-amber-500 text-white shadow-md shadow-amber-500/25', hover: 'hover:bg-amber-50 hover:text-amber-700' },
    profile: { active: 'bg-violet-600 text-white shadow-md shadow-violet-600/25', hover: 'hover:bg-violet-50 hover:text-violet-700' },
    cv: { active: 'bg-emerald-600 text-white shadow-md shadow-emerald-600/25', hover: 'hover:bg-emerald-50 hover:text-emerald-700' },
  };
  const tabClass = (tab: typeof activeTab) =>
    `w-full text-left rounded-xl px-4 py-3 font-semibold transition-all ${
      activeTab === tab ? TAB_COLORS[tab].active : `text-slate-600 ${TAB_COLORS[tab].hover}`
    }`;

  return (
    <div className="flex h-screen bg-slate-50">
      <aside className="w-80 border-r border-slate-200 bg-white shrink-0 flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl">ITBS</div>
            <span className="text-xl font-black text-slate-900">StudentPortal</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{t('Online Evaluation System')}</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={() => setActiveTab('exams')} className={tabClass('exams')}>📝 {t('Available Exams')}</button>
          <button onClick={() => setActiveTab('classes')} className={tabClass('classes')}>🏫 {t('My Classes')}</button>
          <button onClick={() => setActiveTab('profile')} className={tabClass('profile')}>👤 {t('Manage Profile & Achievements')}</button>
          <button onClick={() => setActiveTab('cv')} className={tabClass('cv')}>📄 {t('Manage My CV')}</button>
        </nav>
        <div className="pt-6 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full text-left rounded-xl px-4 py-2.5 font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
            🚪 {t('Logout')}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        {activeTab === 'classes' ? (
          <section className="mx-auto w-full max-w-5xl space-y-6">
            <div>
              <h2 className="text-4xl font-black text-slate-900">{t('My Classes')}</h2>
              <p className="mt-1 text-slate-500">{t('Join virtual classrooms using invite codes provided by your professors.')}</p>
            </div>
            <form onSubmit={handleJoinClass} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                required
                placeholder={t('Enter class join code')}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">
                {t('Request to Join')}
              </button>
            </form>
            {classMessage && <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-medium"><DynamicText text={classMessage} /></div>}
            <div className="grid gap-6 sm:grid-cols-2">
              {classes.map((c) => (
                <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900"><DynamicText text={c.name} /></h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t('Teacher')}: <span className="font-semibold text-slate-700">{c.teacher?.name || '—'}</span>
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{c.description ? <DynamicText text={c.description} /> : 'No description provided.'}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold text-slate-500">{t('Status')}:</span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        c.enrollments?.[0]?.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.enrollments?.[0]?.status === 'REJECTED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {c.enrollments?.[0]?.status === 'APPROVED'
                        ? t('Enrolled')
                        : c.enrollments?.[0]?.status === 'REJECTED'
                        ? t('Request rejected')
                        : t('Pending approval')}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : activeTab === 'cv' ? (
          <section className="mx-auto w-full max-w-6xl space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-black text-slate-900">{t('Manage My CV')}</h2>
                <p className="mt-1 text-slate-500">{t("Upload your CV in PDF format to get started.")}</p>
              </div>
              <button
                onClick={handleEnhanceCv}
                disabled={analyzingCv || !cvUrl}
                className={`rounded-xl bg-indigo-600 px-6 py-3 font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all flex items-center gap-3 ${analyzingCv ? 'animate-pulse' : ''}`}
              >
                {analyzingCv ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('Analyzing your CV...')}
                  </>
                ) : (
                  <>✨ {t('✨ Get AI Recommendation')}</>
                )}
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Preview */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('CV Preview')}</span>
                  <span className="p-2 rounded-xl text-lg text-indigo-600 bg-indigo-50">📄</span>
                </div>
                <div className="flex-1 min-h-[300px] rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                  {cvUrl ? (
                    <iframe src={cvUrl} className="w-full h-full min-h-[300px]" title="CV Preview" />
                  ) : (
                    <div className="p-8 text-center">
                      <svg className="w-8 h-8 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      <p className="text-sm font-medium text-slate-500">{t('No CV uploaded yet.')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t("Upload your CV in PDF format to get started.")}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('Status')}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cvUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {cvUrl ? t('Uploaded') : t('Not uploaded')}
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{t('CV Analysis')}</span>
                    <span className={`font-medium ${cvAnalysis ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {cvAnalysis ? t('Completed') : t('Pending')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{t('AI Model')}</span>
                    <span className="font-medium text-indigo-600">gemini-2.5-flash</span>
                  </div>
                </div>
              </div>

              {/* Errors */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t('Analysis Error')}</span>
                </div>
                <div className="h-[300px] rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                  {cvError ? (
                    <div className="p-6 text-center text-red-600">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">⚠</div>
                      <p className="text-sm font-medium"><DynamicText text={cvError} /></p>
                      <button onClick={handleEnhanceCv} className="mt-4 text-xs font-bold text-indigo-600 hover:underline">
                        {t('Try Again')}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-slate-500">{t('No errors yet')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Upload */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                {t('Upload / Update CV (PDF)')}
                <span className="text-xs text-slate-400 font-normal">{t('PDF only • Max 10MB')}</span>
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => uploadCv(e.target.files?.[0])}
                className="block w-full rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {profileUploadMessage && <p className="mt-3 text-sm font-bold text-emerald-600"><DynamicText text={profileUploadMessage} /></p>}
            </div>

            {/* Analysis result */}
            {cvAnalysis && (
              <div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">✨ {t('AI Recommendations')}</h3>
                  <button
                    onClick={() => copyToClipboard(cvAnalysis)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    {copyStatus === 'copied' ? t('Copied ✓') : t('Copy')}
                  </button>
                </div>
                <CvAnalysisSections text={cvAnalysis} />
              </div>
            )}

            {cvError && !cvAnalysis && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium"><DynamicText text={cvError} /></div>
            )}
          </section>
        ) : activeTab === 'profile' ? (
          <section className="mx-auto w-full max-w-5xl space-y-8">
            <div>
              <h2 className="text-4xl font-black text-slate-900">{t('Manage Profile & Achievements')}</h2>
              <p className="mt-1 text-slate-500">{t('Update your personal information and review your badges and certificates.')}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
              <div className="flex items-center gap-4">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" className="h-20 w-20 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-slate-100 flex items-center justify-center text-3xl">👤</div>
                )}
                <div>
                  <label className="text-sm font-semibold text-slate-700 block mb-1">{t('Profile picture')}</label>
                  <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} className="text-sm text-slate-500" />
                  {profileUploadMessage && <p className="mt-2 text-xs font-bold text-emerald-600"><DynamicText text={profileUploadMessage} /></p>}
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2">
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required placeholder={t('Full name')} className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required type="email" placeholder={t('Email')} className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" placeholder={t('Current password')} className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder={t('New password')} className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <div className="sm:col-span-2 flex items-center gap-4">
                  <button className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">{t('Save profile')}</button>
                  {profileMessage && <span className="text-sm font-bold text-emerald-600"><DynamicText text={profileMessage} /></span>}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">{t('Badges Earned')}</h3>
              {profileData.badges?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">{t('No badges earned yet. Take exams and achieve high scores to unlock badges!')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {profileData.badges?.map((b) => (
                    <div key={b.id} className="flex items-center gap-4 p-4 border border-blue-100 rounded-2xl bg-gradient-to-br from-blue-50/50 to-indigo-50/50 shadow-sm">
                      {b.badge.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.badge.imageUrl} alt="" className="h-14 w-14 rounded-xl object-cover shadow-sm" />
                      ) : (
                        <div className="text-4xl p-2 bg-white rounded-xl shadow-sm">🏆</div>
                      )}
                      <div>
                        <h4 className="font-bold text-slate-900"><DynamicText text={b.badge.name} /></h4>
                        <p className="text-xs text-slate-500 mt-0.5"><DynamicText text={b.badge.description || ''} /></p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">{t('Certificates of Completion')}</h3>
              {profileData.certificates?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">{t('No certificates issued yet. Pass your exams to receive official certificates.')}</p>
              ) : (
                <div className="space-y-4">
                  {profileData.certificates?.map((cert) => (
                    <div key={cert.id} className="p-4 border border-emerald-100 rounded-2xl bg-emerald-50/50 flex justify-between items-center shadow-sm">
                      <div>
                        <h4 className="font-bold text-slate-900">{t('Certificate of Achievement:')} <DynamicText text={cert.examTitle} /></h4>
                        <p className="text-xs font-mono text-emerald-700 mt-0.5">{t('Credential Code:')} {cert.code}</p>
                      </div>
                      <a href={`/student/certificates/${cert.id}`} className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
                        {t('View / Print')}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="mx-auto w-full max-w-7xl space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-4xl font-black text-slate-900">{t('Welcome back')}</h2>
                <p className="mt-1 text-slate-500">{t("Here's your learning overview.")}</p>
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm">
                <span className="px-3 py-1 font-bold text-xs bg-blue-50 text-blue-600 rounded-xl">{t('Language')}</span>
                {(['en', 'fr', 'ar'] as Language[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => changeLanguage(l)}
                    className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${lang === l ? 'bg-blue-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {[
                [t('Available Exams'), exams.length, '📝', 'text-blue-600 bg-blue-50'],
                [t('My Classes'), classes.length, '🏫', 'text-indigo-600 bg-indigo-50'],
                [t('Completed exams'), profileData.submissions.filter((s) => s.status !== 'IN_PROGRESS').length, '🏆', 'text-emerald-600 bg-emerald-50'],
                [
                  t('Average grade'),
                  (() => {
                    const graded = profileData.submissions.filter((s) => s.status === 'GRADED' && s.totalScore > 0);
                    return graded.length
                      ? `${Math.round((graded.reduce((sum, s) => sum + (s.score / s.totalScore) * 100, 0) / graded.length))}%`
                      : '—';
                  })(),
                  '📊',
                  'text-amber-600 bg-amber-50',
                ],
                [t('Badges Earned'), profileData.badges.length, '🏅', 'text-purple-600 bg-purple-50'],
              ].map(([label, value, icon, color]) => (
                <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                    <span className={`p-2 rounded-xl text-lg ${color}`}>{icon}</span>
                  </div>
                  <p className="text-4xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-3xl font-black text-slate-900">{t('Available Exams')}</h3>
              {loading ? (
                <div className="p-8 text-center text-slate-400">{t('Loading exams...')}</div>
              ) : exams.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-500">
                  {t('No exams available right now. Join a class or check back later!')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {exams.map((exam) => (
                    <div key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between hover:border-blue-300 transition-all">
                      <div>
                        <h4 className="text-xl font-bold text-slate-900"><DynamicText text={exam.title} /></h4>
                        <p className="mt-2 text-sm text-slate-500 line-clamp-2">{exam.description ? <DynamicText text={exam.description} /> : 'No description provided.'}</p>
                        <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-400">
                          <span>⏱ {t('Duration')}: {exam.duration} {t('min')}</span>
                          <span>❓ {t('Questions')}: {exam._count?.questions || 0}</span>
                        </div>
                      </div>
                      <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full">{t('Ready')}</span>
                        <button
                          onClick={() => handleStartExam(exam.id)}
                          className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
                        >
                          {t('Start Exam')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}