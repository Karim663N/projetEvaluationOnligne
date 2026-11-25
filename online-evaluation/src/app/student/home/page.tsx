'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { ClassView, ExamView, StudentProfileView } from '@/lib/types';
import { translations, Language } from '@/lib/i18n';
import { useRoleGuard } from '@/lib/use-role-guard';
import ExamRunner, { type RunnerExam, type SavedAnswer } from '@/components/exam/ExamRunner';

export default function StudentHome() {
  useRoleGuard('STUDENT');
  const router = useRouter();
  const [lang, setLang] = useState<Language>('en');
  const t = translations[lang];

  const [exams, setExams] = useState<ExamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'exams' | 'profile' | 'classes' | 'cv'>('exams');

  // Exam taking (ecran : components/exam/ExamRunner.tsx)
  const [activeExam, setActiveExam] = useState<ExamView | null>(null);
  const [attemptInfo, setAttemptInfo] = useState<{ expiresAt: string; answers: SavedAnswer[] } | null>(null);

  // Surveillance ExamGuard AI : consentement explicite avant l'examen (EF2), webcam optionnelle
  const [pendingExamId, setPendingExamId] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentWebcam, setConsentWebcam] = useState(false); // consentement explicite : jamais pre-coche

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

    let message = t.generalError;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch('/api/student/cv/enhance', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          setCvAnalysis(data.text);
          setAnalyzingCv(false);
          return;
        }
        message = data.error || t.generalError;
        // Client errors (no CV, unreadable PDF...) will not succeed on retry
        if (res.status < 500) break;
      } catch (err: unknown) {
        message = (err as Error).message || t.generalError;
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
      if (res.ok) {
        // reprise possible : heure de fin et reponses deja enregistrees viennent du serveur
        setAttemptInfo({ expiresAt: attemptData.attempt.expiresAt, answers: attemptData.answers || [] });
        setActiveExam(data.exam ?? data); // la route renvoie { exam }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const closeExam = () => {
    setActiveExam(null);
    setAttemptInfo(null);
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

  // ---------- Exam taking screen ----------
  if (activeExam && attemptInfo) {
    return (
      <ExamRunner
        exam={activeExam as unknown as RunnerExam}
        expiresAt={attemptInfo.expiresAt}
        savedAnswers={attemptInfo.answers}
        consentWebcam={consentWebcam}
        onClose={closeExam}
      />
    );
  }

  // ---------- Main portal ----------
  const tabClass = (tab: typeof activeTab) =>
    `w-full text-left rounded-xl px-4 py-3 font-semibold transition-all ${
      activeTab === tab ? 'bg-blue-50 text-blue-600 shadow-sm' : 'hover:bg-slate-50 text-slate-600'
    }`;

  return (
    <div className="flex h-screen bg-slate-50">
      {pendingExamId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="consent-title" className="text-xl font-black text-slate-900">Surveillance de l&apos;examen</h3>
            <p className="text-sm text-slate-600">
              Pendant cet examen, ExamGuard AI mesure le temps passé sur chaque question et compte certains événements du
              navigateur (changement d&apos;onglet, copier-coller). Si vous l&apos;acceptez, la webcam est analysée{' '}
              <strong>dans votre navigateur</strong> : seuls des indicateurs (position du visage, des mains, présence d&apos;un
              téléphone) sont envoyés, jamais d&apos;image ni de vidéo.
            </p>
            <p className="text-sm text-slate-600">
              Le score produit n&apos;est pas une preuve : votre enseignant examine chaque alerte et décide.
            </p>
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-1" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
              <span>J&apos;ai lu ces informations et j&apos;accepte la surveillance de cet examen.</span>
            </label>
            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" className="mt-1" checked={consentWebcam} onChange={(e) => setConsentWebcam(e.target.checked)} />
              <span>Activer la webcam (facultatif ; sans webcam, seul le score navigateur est calculé).</span>
            </label>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setPendingExamId(null)} className="rounded-xl border border-slate-300 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Annuler</button>
              <button
                disabled={!consentAccepted}
                onClick={() => { const id = pendingExamId; setPendingExamId(null); if (id) handleStartExam(id); }}
                className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-40"
              >
                Commencer l&apos;examen
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className="w-64 border-r border-slate-200 bg-white shrink-0 flex flex-col">
        <div className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl">ITBS</div>
            <span className="text-xl font-black text-slate-900">StudentPortal</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Online Evaluation System</p>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <button onClick={() => setActiveTab('exams')} className={tabClass('exams')}>📝 {t.availableExams}</button>
          <button onClick={() => setActiveTab('classes')} className={tabClass('classes')}>🏫 {t.myClasses}</button>
          <button onClick={() => setActiveTab('profile')} className={tabClass('profile')}>👤 Manage Profile & Achievements</button>
          <button onClick={() => setActiveTab('cv')} className={tabClass('cv')}>📄 {t.manageMyCV}</button>
        </nav>
        <div className="pt-6 border-t border-slate-100">
          <button onClick={handleLogout} className="w-full text-left rounded-xl px-4 py-2.5 font-semibold text-rose-600 hover:bg-rose-50 transition-colors">
            🚪 {t.logout}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-10 overflow-y-auto">
        {activeTab === 'classes' ? (
          <section className="max-w-4xl space-y-6">
            <div>
              <h2 className="text-3xl font-black text-slate-900">{t.myClasses}</h2>
              <p className="mt-1 text-slate-500">Join virtual classrooms using invite codes provided by your professors.</p>
            </div>
            <form onSubmit={handleJoinClass} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row">
              <input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                required
                placeholder={t.enterJoinCode}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-3 uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              <button className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">
                {t.requestToJoin}
              </button>
            </form>
            {classMessage && <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 font-medium">{classMessage}</div>}
            <div className="grid gap-6 sm:grid-cols-2">
              {classes.map((c) => (
                <article key={c.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{c.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t.teacher}: <span className="font-semibold text-slate-700">{c.teacher?.name || '—'}</span>
                    </p>
                    <p className="mt-2 text-xs text-slate-400">{c.description || 'No description provided.'}</p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="text-xs font-semibold text-slate-500">{t.status}:</span>
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
                        ? t.enrolled
                        : c.enrollments?.[0]?.status === 'REJECTED'
                        ? t.requestRejected
                        : t.pendingApproval}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : activeTab === 'cv' ? (
          <section className="max-w-5xl space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900">{t.manageMyCV}</h2>
                <p className="mt-1 text-slate-500">{t.uploadCVDesc}</p>
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
                    {t.enhancing}
                  </>
                ) : (
                  <>✨ {t.enhanceCv}</>
                )}
              </button>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Preview */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.cvPreview}</span>
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
                      <p className="text-sm font-medium text-slate-500">{t.noCV}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.uploadCVDesc}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Status</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${cvUrl ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}>
                    {cvUrl ? 'Uploaded' : 'Not uploaded'}
                  </span>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">CV Analysis</span>
                    <span className={`font-medium ${cvAnalysis ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {cvAnalysis ? 'Completed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">AI Model</span>
                    <span className="font-medium text-indigo-600">gemini-2.5-flash</span>
                  </div>
                </div>
              </div>

              {/* Errors */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.errorTitle}</span>
                </div>
                <div className="h-[300px] rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                  {cvError ? (
                    <div className="p-6 text-center text-red-600">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3">⚠</div>
                      <p className="text-sm font-medium">{cvError}</p>
                      <button onClick={handleEnhanceCv} className="mt-4 text-xs font-bold text-indigo-600 hover:underline">
                        {t.retry}
                      </button>
                    </div>
                  ) : (
                    <div className="text-center">
                      <p className="text-sm text-slate-500">No errors yet</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Upload */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <label className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                {t.uploadCV}
                <span className="text-xs text-slate-400 font-normal">PDF only • Max 10MB</span>
              </label>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => uploadCv(e.target.files?.[0])}
                className="block w-full rounded-xl border-2 border-dashed border-slate-300 px-6 py-8 text-center text-slate-500 hover:border-indigo-300 hover:bg-indigo-50 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {profileUploadMessage && <p className="mt-3 text-sm font-bold text-emerald-600">{profileUploadMessage}</p>}
            </div>

            {/* Analysis result */}
            {cvAnalysis && (
              <div className="rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900">✨ AI Recommendations</h3>
                  <button
                    onClick={() => copyToClipboard(cvAnalysis)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    {copyStatus === 'copied' ? 'Copied ✓' : 'Copy'}
                  </button>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{cvAnalysis}</div>
              </div>
            )}

            {cvError && !cvAnalysis && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium">{cvError}</div>
            )}
          </section>
        ) : activeTab === 'profile' ? (
          <section className="max-w-4xl space-y-8">
            <div>
              <h2 className="text-3xl font-black text-slate-900">Manage Profile & Achievements</h2>
              <p className="mt-1 text-slate-500">Update your personal information and review your badges and certificates.</p>
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
                  <label className="text-sm font-semibold text-slate-700 block mb-1">Profile picture</label>
                  <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} className="text-sm text-slate-500" />
                  {profileUploadMessage && <p className="mt-2 text-xs font-bold text-emerald-600">{profileUploadMessage}</p>}
                </div>
              </div>

              <form onSubmit={handleSaveProfile} className="grid gap-4 sm:grid-cols-2">
                <input value={profileName} onChange={(e) => setProfileName(e.target.value)} required placeholder="Full name" className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required type="email" placeholder="Email" className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" placeholder="Current password" className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" placeholder="New password" className="rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-600" />
                <div className="sm:col-span-2 flex items-center gap-4">
                  <button className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all">Save profile</button>
                  {profileMessage && <span className="text-sm font-bold text-emerald-600">{profileMessage}</span>}
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">{t.badgesEarned}</h3>
              {profileData.badges?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No badges earned yet. Take exams and achieve high scores to unlock badges!</p>
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
                        <h4 className="font-bold text-slate-900">{b.badge.name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">{b.badge.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900 mb-4">{t.certificates}</h3>
              {profileData.certificates?.length === 0 ? (
                <p className="text-slate-500 text-sm py-4">No certificates issued yet. Pass your exams to receive official certificates.</p>
              ) : (
                <div className="space-y-4">
                  {profileData.certificates?.map((cert) => (
                    <div key={cert.id} className="p-4 border border-emerald-100 rounded-2xl bg-emerald-50/50 flex justify-between items-center shadow-sm">
                      <div>
                        <h4 className="font-bold text-slate-900">Certificate of Achievement: {cert.examTitle}</h4>
                        <p className="text-xs font-mono text-emerald-700 mt-0.5">Credential Code: {cert.code}</p>
                      </div>
                      <a href={`/student/certificates/${cert.id}`} className="text-xs font-bold bg-emerald-600 text-white px-4 py-2 rounded-xl shadow-md shadow-emerald-600/20 hover:bg-emerald-700 transition-all">
                        View / Print
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : (
          <div className="max-w-6xl space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-black text-slate-900">{t.welcomeBack}</h2>
                <p className="mt-1 text-slate-500">{t.learningOverview}</p>
              </div>
              <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-2xl shadow-sm">
                <span className="px-3 py-1 font-bold text-xs bg-blue-50 text-blue-600 rounded-xl">Language</span>
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
                [t.availableExams, exams.length, '📝', 'text-blue-600 bg-blue-50'],
                [t.myClasses, classes.length, '🏫', 'text-indigo-600 bg-indigo-50'],
                ['Completed exams', profileData.submissions.filter((s) => s.status !== 'IN_PROGRESS').length, '🏆', 'text-emerald-600 bg-emerald-50'],
                [
                  'Average grade',
                  (() => {
                    const graded = profileData.submissions.filter((s) => s.status === 'GRADED' && s.totalScore > 0);
                    return graded.length
                      ? `${Math.round((graded.reduce((sum, s) => sum + (s.score / s.totalScore) * 100, 0) / graded.length))}%`
                      : '—';
                  })(),
                  '📊',
                  'text-amber-600 bg-amber-50',
                ],
                [t.badgesEarned, profileData.badges.length, '🏅', 'text-purple-600 bg-purple-50'],
              ].map(([label, value, icon, color]) => (
                <div key={label as string} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                    <span className={`p-2 rounded-xl text-lg ${color}`}>{icon}</span>
                  </div>
                  <p className="text-3xl font-black text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="text-2xl font-black text-slate-900">{t.availableExams}</h3>
              {loading ? (
                <div className="p-8 text-center text-slate-400">Loading exams...</div>
              ) : exams.length === 0 ? (
                <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-500">
                  No exams available right now. Join a class or check back later!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {exams.map((exam) => (
                    <div key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between hover:border-blue-300 transition-all">
                      <div>
                        <h4 className="text-xl font-bold text-slate-900">{exam.title}</h4>
                        <p className="mt-2 text-sm text-slate-500 line-clamp-2">{exam.description || 'No description provided.'}</p>
                        <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-400">
                          <span>⏱ {t.duration}: {exam.duration} mins</span>
                          <span>❓ {t.questions}: {exam._count?.questions || 0}</span>
                        </div>
                      </div>
                      {(() => {
                        const attempt = exam.submissions?.[0];
                        if (attempt && attempt.status !== 'IN_PROGRESS') {
                          return (
                            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-full">
                                {attempt.status === 'GRADED' ? `Terminé · ${attempt.score} / ${attempt.totalScore}` : 'Remis · en correction'}
                              </span>
                              <span className="text-sm font-semibold text-slate-400">Copie remise</span>
                            </div>
                          );
                        }
                        return (
                          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${attempt ? 'text-amber-700 bg-amber-50' : 'text-blue-600 bg-blue-50'}`}>{attempt ? 'En cours' : 'Disponible'}</span>
                            <button
                              onClick={() => { setPendingExamId(exam.id); setConsentAccepted(false); setConsentWebcam(false); }}
                              className="rounded-xl bg-blue-600 px-5 py-2.5 font-bold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
                            >
                              {attempt ? 'Reprendre' : t.startExam}
                            </button>
                          </div>
                        );
                      })()}
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
