'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClassView, ExamView, StudentProfileView } from '@/lib/types';
import { translations } from '@/lib/i18n';
import { useLang } from '@/lib/use-lang';
import { useRoleGuard } from '@/lib/use-role-guard';
import ExamRunner, { type RunnerExam, type SavedAnswer } from '@/components/exam/ExamRunner';
import CvAnalysisSections from '@/components/CvAnalysisSections';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, IconBubble, PageHeader, ProgressRing, StatCard } from '@/components/ui/kit';
import { LineChart, Meter } from '@/components/ui/charts';
import { DynamicText, useT } from '@/lib/dynamic-text';

type Tab = 'exams' | 'profile' | 'classes' | 'cv';
type ExamFilter = 'all' | 'todo' | 'progress' | 'done';

const examState = (exam: ExamView): Exclude<ExamFilter, 'all'> => {
  const s = exam.submissions?.[0];
  return !s ? 'todo' : s.status === 'IN_PROGRESS' ? 'progress' : 'done';
};

export default function StudentHome() {
  useRoleGuard('STUDENT');
  const [lang] = useLang();
  const t = translations[lang];
  const tt = useT();
  const locale = lang === 'ar' ? 'ar' : lang === 'en' ? 'en-GB' : 'fr-FR';

  const [exams, setExams] = useState<ExamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('exams');
  const [filter, setFilter] = useState<ExamFilter>('all');
  const [query, setQuery] = useState('');

  // Passage d'examen (ecran : components/exam/ExamRunner.tsx)
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

  // Profil
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
    // lien direct vers un onglet depuis une autre page : /student/home?tab=classes
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'classes' || tab === 'cv' || tab === 'profile') setActiveTab(tab);
  }, []);

  const selectTab = (key: string) => {
    setActiveTab(key as Tab);
    window.history.replaceState(null, '', key === 'exams' ? '/student/home' : `/student/home?tab=${key}`);
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
    const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ joinCode }) });
    const data = await res.json();
    setClassMessage(res.ok
      ? data.enrollment.status === 'APPROVED' ? 'Vous êtes déjà inscrit dans cette classe.' : 'Demande envoyée. Votre enseignant va l’examiner.'
      : data.error || 'Impossible de rejoindre la classe');
    if (res.ok) { setJoinCode(''); fetchClasses(); }
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
    setProfileUploadMessage(res.ok ? 'Photo de profil mise à jour.' : data.error || 'Import de la photo impossible');
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
        setProfileUploadMessage(data.warning === 'no_text_extracted'
          ? 'CV importé, mais aucun texte n’a pu être extrait (PDF scanné ?). L’analyse IA nécessite un PDF texte.'
          : 'CV importé avec succès.');
        setCvUrl(data.cvUrl);
        setCvAnalysis(null);
        setCvError(null);
      } else {
        setProfileUploadMessage(data.error || 'Import du CV impossible');
      }
    } catch (err) {
      console.error(err);
      setProfileUploadMessage('Import du CV impossible');
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
        if (res.ok) { setCvAnalysis(data.text); setAnalyzingCv(false); return; }
        message = data.error || t.generalError;
        if (res.status < 500) break; // erreurs client (pas de CV, PDF illisible…) : inutile de reessayer
      } catch (err: unknown) {
        message = (err as Error).message || t.generalError;
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
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
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: profileName, email: profileEmail, avatarUrl, currentPassword, newPassword }),
    });
    const data = await res.json();
    setProfileMessage(res.ok ? 'Profil enregistré.' : data.error || 'Enregistrement du profil impossible');
    if (res.ok) { setProfileData({ ...profileData, user: data.user }); setCurrentPassword(''); setNewPassword(''); }
  };

  const handleStartExam = async (examId: string) => {
    try {
      const attemptRes = await fetch(`/api/exams/${examId}/attempt`);
      const attemptData = await attemptRes.json();
      if (!attemptRes.ok) { alert(attemptData.error || 'Impossible de démarrer l’examen'); return; }
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

  const openConsent = (examId: string) => { setPendingExamId(examId); setConsentAccepted(false); setConsentWebcam(false); };

  // ---------- indicateurs ----------
  const graded = profileData.submissions.filter((s) => s.status === 'GRADED' && s.totalScore > 0);
  const average = graded.length ? graded.reduce((sum, s) => sum + s.score / s.totalScore, 0) / graded.length : null;
  const counts = useMemo(() => ({
    todo: exams.filter((e) => examState(e) === 'todo').length,
    progress: exams.filter((e) => examState(e) === 'progress').length,
    done: exams.filter((e) => examState(e) === 'done').length,
  }), [exams]);
  const nextExam = exams.find((e) => examState(e) === 'progress') ?? exams.find((e) => examState(e) === 'todo');
  const shownExams = exams
    .filter((e) => filter === 'all' || examState(e) === filter)
    .filter((e) => !query.trim() || `${e.title} ${e.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  // progression : copies notees dans l'ordre chronologique
  const timeline = graded
    .map((s) => ({ s, at: new Date(s.completedAt ?? s.submittedAt) }))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  const trend = timeline.length >= 2 ? timeline[timeline.length - 1].s.score / timeline[timeline.length - 1].s.totalScore - timeline[0].s.score / timeline[0].s.totalScore : null;
  const firstName = (profileData.user?.name || profileName || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 5 || hour >= 18 ? 'Bonsoir' : 'Bonjour';

  // ---------- ecran d'examen ----------
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

  return (
    <AppShell role="STUDENT" active={activeTab} onSelect={selectTab}>
      {pendingExamId && (
        <div className="eg-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="consent-title">
          <div className="eg-modal max-w-xl">
            <div className="flex items-start gap-4">
              <IconBubble icon="shield" />
              <div>
                <h3 id="consent-title" className="text-lg font-bold text-slate-900">{tt('Surveillance de l’examen')}</h3>
                <p className="mt-1 text-sm text-slate-500">{tt('Lisez ces informations avant de commencer.')}</p>
              </div>
            </div>
            <ul className="mt-5 space-y-3 text-sm text-slate-600">
              <li className="flex gap-3"><Icon name="clock" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{tt('ExamGuard AI mesure le temps passé sur chaque question et compte certains événements du navigateur (changement d’onglet, copier-coller).')}</li>
              <li className="flex gap-3"><Icon name="camera" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span>{tt('Si vous l’acceptez, la webcam est analysée')} <strong>{tt('dans votre navigateur')}</strong> : {tt('seuls des indicateurs (visage, mains, téléphone) sont envoyés, jamais d’image ni de vidéo.')}</span></li>
              <li className="flex gap-3"><Icon name="user" className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />{tt('Le score produit n’est pas une preuve : votre enseignant examine chaque alerte et décide.')}</li>
            </ul>
            <div className="mt-6 space-y-2.5">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm ring-1 transition ${consentAccepted ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={consentAccepted} onChange={(e) => setConsentAccepted(e.target.checked)} />
                <span className="text-slate-800">{tt('J’ai lu ces informations et j’accepte la surveillance de cet examen.')} <span className="text-rose-600">*</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl p-3 text-sm ring-1 transition ${consentWebcam ? 'bg-brand-50 ring-brand-300' : 'ring-slate-200 hover:bg-slate-50'}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={consentWebcam} onChange={(e) => setConsentWebcam(e.target.checked)} />
                <span className="text-slate-800">{tt('Activer la webcam')} <span className="text-slate-500">{tt('(facultatif ; sans webcam, seul le score navigateur est calculé)')}</span></span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setPendingExamId(null)} className="eg-btn eg-btn-secondary">{tt('Annuler')}</button>
              <button disabled={!consentAccepted} onClick={() => { const id = pendingExamId; setPendingExamId(null); if (id) handleStartExam(id); }} className="eg-btn eg-btn-primary">
                {tt('Commencer l’examen')} <Icon name="arrowRight" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'classes' ? (
        <section>
          <PageHeader eyebrow={tt('Apprentissage')} title={t.myClasses} subtitle={tt('Rejoignez les classes de vos enseignants avec leur code d’invitation.')} />
          <form onSubmit={handleJoinClass} className="eg-card flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
            <IconBubble icon="key" className="hidden h-11 w-11 sm:grid" />
            <div className="flex-1">
              <label htmlFor="join" className="sr-only">{t.enterJoinCode}</label>
              <input id="join" value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} required placeholder={t.enterJoinCode} className="eg-input font-mono uppercase tracking-[0.3em]" />
            </div>
            <button className="eg-btn eg-btn-primary"><Icon name="plus" className="h-4 w-4" />{t.requestToJoin}</button>
          </form>
          {classMessage && <div className="eg-alert eg-alert-info mt-4"><DynamicText text={classMessage} /></div>}
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {classes.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon="users" title={tt('Aucune classe pour l’instant')} text={tt('Demandez le code de la classe à votre enseignant puis saisissez-le ci-dessus.')} /></div>}
            {classes.map((c) => {
              const st = c.enrollments?.[0]?.status;
              return (
                <article key={c.id} className="eg-card eg-card-hover flex flex-col p-5">
                  <div className="flex items-start gap-3">
                    <IconBubble icon="cap" tone="violet" />
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-slate-900">{c.name}</h3>
                      <p className="text-sm text-slate-500">{t.teacher} : <span className="font-medium text-slate-700">{c.teacher?.name || '—'}</span></p>
                    </div>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm text-slate-500">{c.description || tt('Pas de description.')}</p>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4 text-xs">
                    <span className="text-slate-500">{t.status}</span>
                    <span className={`eg-badge ${st === 'APPROVED' ? 'eg-badge-green' : st === 'REJECTED' ? 'eg-badge-red' : 'eg-badge-amber'}`}>
                      {st === 'APPROVED' ? t.enrolled : st === 'REJECTED' ? t.requestRejected : t.pendingApproval}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : activeTab === 'cv' ? (
        <section>
          <PageHeader eyebrow={tt('Carrière')} title={t.manageMyCV} subtitle={t.uploadCVDesc}
            actions={
              <button onClick={handleEnhanceCv} disabled={analyzingCv || !cvUrl} className={`eg-btn eg-btn-primary ${analyzingCv ? 'animate-pulse' : ''}`}>
                {analyzingCv ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{t.enhancing}</> : <><Icon name="sparkles" className="h-4 w-4" />{tt('Analyse IA du CV')}</>}
              </button>
            } />
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div className="eg-card overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <p className="eg-h2">{t.cvPreview}</p>
                <span className={`eg-badge ${cvUrl ? 'eg-badge-green' : 'eg-badge-slate'}`}>{cvUrl ? tt('Importé') : tt('Non importé')}</span>
              </div>
              <div className="grid min-h-[420px] place-items-center bg-slate-50">
                {cvUrl ? <iframe src={cvUrl} className="h-[480px] w-full" title={tt('Aperçu du CV')} /> : (
                  <div className="p-8 text-center">
                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-400 ring-1 ring-slate-200"><Icon name="exam" /></span>
                    <p className="mt-3 text-sm font-medium text-slate-600">{t.noCV}</p>
                    <p className="text-xs text-slate-400">{t.uploadCVDesc}</p>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-5">
              <div className="eg-card p-5">
                <p className="eg-h2">{t.uploadCV}</p>
                <p className="eg-hint mb-3">{tt('PDF uniquement · 10 Mo maximum')}</p>
                <input type="file" accept="application/pdf,.pdf" onChange={(e) => uploadCv(e.target.files?.[0])} className="eg-file" />
                {profileUploadMessage && <p className="mt-3 text-sm font-medium text-emerald-700"><DynamicText text={profileUploadMessage} /></p>}
              </div>
              <div className="eg-card space-y-3 p-5 text-sm">
                <p className="eg-h2">{tt('État de l’analyse')}</p>
                <div className="flex justify-between"><span className="text-slate-500">{tt('Analyse du CV')}</span><span className={`font-semibold ${cvAnalysis ? 'text-emerald-600' : 'text-slate-400'}`}>{cvAnalysis ? tt('Terminée') : tt('En attente')}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">{tt('Modèle IA')}</span><span className="font-mono text-xs font-semibold text-brand-600">groq → gemini</span></div>
              </div>
              {cvError && (
                <div className="eg-alert eg-alert-error">
                  <p className="font-semibold">{t.errorTitle}</p>
                  <p className="mt-1 font-normal"><DynamicText text={cvError} /></p>
                  <button onClick={handleEnhanceCv} className="mt-2 text-xs font-bold underline">{t.retry}</button>
                </div>
              )}
            </div>
          </div>
          {cvAnalysis && (
            <div className="eg-card mt-5 p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Icon name="sparkles" className="h-5 w-5 text-brand-600" />{tt('Recommandations IA')}</h3>
                <button onClick={() => copyToClipboard(cvAnalysis)} className="eg-btn eg-btn-secondary eg-btn-sm"><Icon name="copy" className="h-3.5 w-3.5" />{copyStatus === 'copied' ? t.copied : tt('Copier')}</button>
              </div>
              <CvAnalysisSections text={cvAnalysis} />
            </div>
          )}
        </section>
      ) : activeTab === 'profile' ? (
        <section>
          <PageHeader eyebrow={tt('Compte')} title={tt('Profil & réussites')} subtitle={tt('Mettez à jour vos informations et retrouvez vos badges et certificats.')} />
          <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
            <div className="eg-card overflow-hidden">
              <div className="h-24 eg-aurora" />
              <div className="-mt-10 px-6 pb-6 text-center">
                <Avatar name={profileName} src={avatarUrl || null} className="mx-auto h-20 w-20 text-2xl ring-4 ring-white" />
                <p className="mt-3 text-lg font-semibold text-slate-900">{profileName || '—'}</p>
                <p className="text-sm text-slate-500">{profileEmail}</p>
                <div className="mt-5 grid grid-cols-3 gap-2 text-center">
                  {[[counts.done, tt('examens')], [profileData.badges.length, 'badges'], [profileData.certificates.length, tt('certificats')]].map(([v, k]) => (
                    <div key={k as string} className="rounded-xl bg-slate-50 py-2.5"><p className="text-lg font-bold text-slate-900">{v}</p><p className="text-[11px] text-slate-500">{k}</p></div>
                  ))}
                </div>
                <label className="eg-btn eg-btn-secondary eg-btn-sm mt-5 cursor-pointer"><Icon name="upload" className="h-3.5 w-3.5" />{tt('Changer la photo')}
                  <input type="file" accept="image/*" onChange={(e) => uploadAvatar(e.target.files?.[0])} className="hidden" />
                </label>
                {profileUploadMessage && <p className="mt-2 text-xs font-medium text-emerald-700"><DynamicText text={profileUploadMessage} /></p>}
              </div>
            </div>
            <form onSubmit={handleSaveProfile} className="eg-card grid gap-4 p-6 sm:grid-cols-2">
              <p className="eg-h2 sm:col-span-2">{tt('Informations personnelles')}</p>
              <label><span className="eg-label">{tt('Nom complet')}</span><input value={profileName} onChange={(e) => setProfileName(e.target.value)} required className="eg-input" /></label>
              <label><span className="eg-label">{tt('Adresse e-mail')}</span><input value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} required type="email" className="eg-input" /></label>
              <p className="eg-h2 mt-2 sm:col-span-2">{tt('Sécurité')}</p>
              <label><span className="eg-label">{tt('Mot de passe actuel')}</span><input value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} type="password" autoComplete="current-password" className="eg-input" /></label>
              <label><span className="eg-label">{tt('Nouveau mot de passe')}</span><input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" autoComplete="new-password" placeholder={tt('Laisser vide pour conserver')} className="eg-input" /></label>
              <div className="flex items-center gap-3 border-t border-slate-100 pt-4 sm:col-span-2">
                <button className="eg-btn eg-btn-primary">{t.saveProfile}</button>
                {profileMessage && <span className="text-sm font-medium text-emerald-700"><DynamicText text={profileMessage} /></span>}
              </div>
            </form>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <div className="eg-card p-6">
              <p className="eg-h2 mb-4">{t.badgesEarned}</p>
              {profileData.badges?.length === 0 ? <EmptyState icon="award" title={tt('Aucun badge pour l’instant')} text={tt('Réussissez vos examens pour débloquer des badges.')} /> : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {profileData.badges?.map((b) => (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 p-3 ring-1 ring-brand-100">
                      {b.badge.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={b.badge.imageUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
                        : <IconBubble icon="award" tone="amber" className="h-12 w-12" />}
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{b.badge.name}</p><p className="line-clamp-2 text-xs text-slate-500">{b.badge.description}</p></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="eg-card p-6">
              <p className="eg-h2 mb-4">{t.certificates}</p>
              {profileData.certificates?.length === 0 ? <EmptyState icon="award" title={tt('Aucun certificat pour l’instant')} text={tt('Les certificats délivrés par vos enseignants apparaîtront ici.')} /> : (
                <div className="space-y-3">
                  {profileData.certificates?.map((cert) => (
                    <div key={cert.id} className="flex items-center gap-3 rounded-xl p-3 ring-1 ring-emerald-100">
                      <IconBubble icon="award" tone="green" />
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{cert.examTitle}</p><p className="truncate font-mono text-[11px] text-emerald-700">{cert.code}</p></div>
                      <a href={`/student/certificates/${cert.id}`} className="eg-btn eg-btn-secondary eg-btn-sm">{tt('Voir')}</a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-7">
          {/* accueil : prochaine action */}
          <div className="relative overflow-hidden rounded-3xl eg-aurora p-6 text-white md:p-8">
            <div className="eg-grid-bg absolute inset-0" />
            <div className="relative flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-xl">
                <p className="text-sm font-medium text-slate-300">{new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{tt(greeting)}{firstName ? `, ${firstName}` : ''} 👋</h1>
                <p className="mt-2 text-slate-300">
                  {nextExam
                    ? examState(nextExam) === 'progress' ? <>{tt('Vous avez un examen en cours :')} <strong className="text-white">{nextExam.title}</strong>.</> : <>{tt('Prochain examen disponible :')} <strong className="text-white">{nextExam.title}</strong>.</>
                    : tt('Aucun examen en attente. Profitez-en pour revoir vos résultats.')}
                </p>
                {nextExam && (
                  <button onClick={() => openConsent(nextExam.id)} className="eg-btn eg-btn-lg mt-5 bg-white text-ink-950 hover:bg-slate-100">
                    {examState(nextExam) === 'progress' ? tt('Reprendre l’examen') : tt('Commencer maintenant')} <Icon name="arrowRight" className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
                <ProgressRing value={average ?? 0} size={76} stroke={8} color="#22d3ee"><span className="text-white">{average == null ? '—' : `${Math.round(100 * average)}%`}</span></ProgressRing>
                <div><p className="text-sm font-semibold">{tt('Moyenne générale')}</p><p className="text-xs text-slate-300">{graded.length} {tt(graded.length > 1 ? 'examens notés' : 'examen noté')}</p></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label={tt('À passer')} value={counts.todo} icon="exam" tone="brand" hint={counts.progress ? `${counts.progress} ${tt('en cours')}` : tt('aucun en cours')} />
            <StatCard label={tt('Terminés')} value={counts.done} icon="check" tone="green" />
            <StatCard label={t.myClasses} value={classes.length} icon="users" tone="violet" />
            <StatCard label={t.badgesEarned} value={profileData.badges.length} icon="award" tone="amber" hint={`${profileData.certificates.length} ${tt(profileData.certificates.length > 1 ? 'certificats' : 'certificat')}`} />
          </div>

          {timeline.length > 0 && (
            <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
              <section className="eg-card p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="eg-h2">{tt('Ma progression')}</h2>
                  {trend != null && (
                    <span className={`eg-badge ${trend >= 0 ? 'eg-badge-green' : 'eg-badge-amber'}`}>
                      <Icon name="trending" className="h-3.5 w-3.5" />{trend >= 0 ? '+' : '−'}{Math.abs(Math.round(100 * trend))} {tt('pts depuis le premier examen')}
                    </span>
                  )}
                </div>
                <LineChart height={210} ariaLabel={tt('Score de chaque examen noté, dans l’ordre chronologique')} threshold={0.5} thresholdLabel="50 %"
                  data={timeline.map(({ s, at }) => ({ key: s.id, label: at.toLocaleDateString(locale, { day: 'numeric', month: 'short' }), value: s.score / s.totalScore, tip: `${s.exam?.title ?? tt('Examen')} · ${at.toLocaleDateString(locale)}` }))} />
              </section>
              <section className="eg-card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="eg-h2">{tt('Derniers résultats')}</h2><a href="/student/results" className="text-xs font-semibold text-brand-600 hover:text-brand-700">{tt('Tout voir')}</a></div>
                <ul className="divide-y divide-slate-100">
                  {[...timeline].reverse().slice(0, 5).map(({ s, at }) => {
                    const r = s.score / s.totalScore;
                    const pass = 100 * r >= (s.exam?.passingScore ?? 50);
                    return (
                      <li key={s.id} className="px-5 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 truncate text-sm font-medium text-slate-900">{s.exam?.title ?? tt('Examen')}</p>
                          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{s.score} / {s.totalScore}</span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3">
                          <Meter value={r} tone={pass ? 'green' : 'amber'} />
                          <span className="shrink-0 text-[11px] text-slate-500">{at.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}

          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">{tt('Mes examens')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="eg-segmented" role="group" aria-label={tt('Filtrer les examens')}>
                  {([['all', 'Tous', exams.length], ['todo', 'À passer', counts.todo], ['progress', 'En cours', counts.progress], ['done', 'Terminés', counts.done]] as const).map(([k, label, n]) => (
                    <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}>{tt(label)} <span className="ms-1 text-xs text-slate-400">{n}</span></button>
                  ))}
                </div>
                <div className="relative">
                  <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt('Rechercher…')} className="eg-input w-48 ps-9" aria-label={tt('Rechercher un examen')} />
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="eg-card h-48 animate-pulse bg-slate-100/60" />)}</div>
            ) : shownExams.length === 0 ? (
              <EmptyState icon="exam" title={exams.length ? tt('Aucun examen pour ce filtre') : tt('Aucun examen disponible')} text={exams.length ? tt('Changez de filtre ou de recherche.') : tt('Rejoignez une classe ou revenez plus tard.')} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {shownExams.map((exam) => {
                  const attempt = exam.submissions?.[0];
                  const st = examState(exam);
                  const ratio = attempt && attempt.status === 'GRADED' && attempt.totalScore > 0 ? attempt.score / attempt.totalScore : null;
                  return (
                    <article key={exam.id} className="eg-card eg-card-hover flex flex-col p-5">
                      <div className="flex items-start justify-between gap-3">
                        <IconBubble icon={st === 'done' ? 'check' : st === 'progress' ? 'clock' : 'exam'} tone={st === 'done' ? 'green' : st === 'progress' ? 'amber' : 'brand'} />
                        <span className={`eg-badge ${st === 'done' ? (attempt?.status === 'GRADED' ? 'eg-badge-green' : 'eg-badge-slate') : st === 'progress' ? 'eg-badge-amber' : 'eg-badge-brand'}`}>
                          {st === 'done' ? (attempt?.status === 'GRADED' ? tt('Noté') : tt('En correction')) : st === 'progress' ? tt('En cours') : tt('Disponible')}
                        </span>
                      </div>
                      <h3 className="mt-4 line-clamp-2 font-semibold text-slate-900">{exam.title}</h3>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{exam.description || tt('Pas de description.')}</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Icon name="clock" className="h-3.5 w-3.5" />{exam.duration} min</span>
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Icon name="help" className="h-3.5 w-3.5" />{exam._count?.questions || 0} {tt('questions')}</span>
                      </div>
                      <div className="mt-auto pt-5">
                        {st === 'done' ? (
                          ratio != null ? (
                            <div>
                              <div className="flex items-baseline justify-between text-sm"><span className="text-slate-500">{tt('Score')}</span><span className="font-semibold text-slate-900">{attempt!.score} / {attempt!.totalScore}</span></div>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${ratio >= 0.5 ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-amber-500 to-amber-400'}`} style={{ width: `${Math.round(100 * ratio)}%` }} /></div>
                            </div>
                          ) : <p className="text-sm text-slate-500">{tt('Copie remise · en attente de correction')}</p>
                        ) : (
                          <button onClick={() => openConsent(exam.id)} className={`eg-btn w-full ${st === 'progress' ? 'eg-btn-soft' : 'eg-btn-primary'}`}>
                            {st === 'progress' ? tt('Reprendre') : tt('Commencer')} <Icon name="arrowRight" className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </AppShell>
  );
}
