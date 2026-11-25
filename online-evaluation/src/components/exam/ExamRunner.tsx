'use client';

// Passage d'examen ExamGuard AI : une question a la fois, grille de navigation, questions a revoir,
// raccourcis clavier, enregistrement automatique (reprise apres rechargement), minuteur serveur,
// ecran de revision avant remise. La surveillance (useProctoring) suit exactement la question affichee.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useProctoring } from '@/lib/use-proctoring';
import { Icon } from '@/components/ui/Icon';
import { LogoMark, ProgressRing } from '@/components/ui/kit';

export interface RunnerOption { id: string; text: string; imageUrl?: string | null }
export interface RunnerQuestion {
  id: string;
  text: string;
  points: number;
  questionType: 'SINGLE' | 'MULTIPLE' | 'BOOLEAN' | 'TEXT_ESSAY';
  imageUrl?: string | null;
  options: RunnerOption[];
}
export interface RunnerExam { id: string; title: string; description?: string | null; duration?: number; questions: RunnerQuestion[] }
export interface SavedAnswer { questionId: string; selectedOptionId: string | null; textResponse: string | null }
interface Result { score: number; totalScore: number; status: string }
type Answer = { ids: string[]; text: string };
type View = 'question' | 'review' | 'result';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TYPE_LABEL: Record<RunnerQuestion['questionType'], string> = {
  SINGLE: 'Choix unique', MULTIPLE: 'Choix multiple', BOOLEAN: 'Vrai / faux', TEXT_ESSAY: 'Réponse rédigée',
};

const isAnswered = (a?: Answer) => Boolean(a && (a.ids.length > 0 || a.text.trim().length > 0));
const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

type PayloadItem = { questionId: string; selectedOptionId?: string; selectedOptionIds?: string[]; textResponse?: string };

function toPayload(questions: RunnerQuestion[], answers: Record<string, Answer>): PayloadItem[] {
  return questions.flatMap((q): PayloadItem[] => {
    const a = answers[q.id];
    if (!isAnswered(a)) return [];
    if (q.questionType === 'TEXT_ESSAY') return [{ questionId: q.id, textResponse: a.text }];
    if (q.questionType === 'MULTIPLE') return [{ questionId: q.id, selectedOptionIds: a.ids }];
    return [{ questionId: q.id, selectedOptionId: a.ids[0] }];
  });
}

export default function ExamRunner({ exam, expiresAt, savedAnswers, consentWebcam, onClose }: {
  exam: RunnerExam;
  expiresAt: string;
  savedAnswers: SavedAnswer[];
  consentWebcam: boolean;
  onClose: () => void;
}) {
  const questions = exam.questions;
  const n = questions.length;
  const flagKey = `eg-flags-${exam.id}`;

  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    const init: Record<string, Answer> = {};
    for (const s of savedAnswers) {
      const a = init[s.questionId] ?? { ids: [], text: '' };
      if (s.selectedOptionId) a.ids = [...a.ids, s.selectedOptionId];
      if (s.textResponse) a.text = s.textResponse;
      init[s.questionId] = a;
    }
    return init;
  });
  const [flagged, setFlagged] = useState<Set<string>>(() => {
    try { return new Set<string>(JSON.parse(localStorage.getItem(flagKey) || '[]')); } catch { return new Set(); }
  });
  const [idx, setIdx] = useState(() => {
    const first = questions.findIndex((q) => !savedAnswers.some((s) => s.questionId === q.id));
    return first >= 0 ? first : 0;
  });
  const [view, setView] = useState<View>('question');
  const [secondsLeft, setSecondsLeft] = useState(() => Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)));
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');
  const autoSubmitted = useRef(false);
  const lastSaved = useRef<string | null>(null); // dernier contenu enregistre : evite les PUT inutiles

  const proctor = useProctoring(view !== 'result', questions[0]?.id ?? null, consentWebcam);
  const { markActive, snapshot } = proctor;
  const current = questions[idx];
  const answeredCount = useMemo(() => questions.filter((q) => isAnswered(answers[q.id])).length, [questions, answers]);

  // la surveillance compte le temps sur la question reellement affichee
  useEffect(() => { if (current && view === 'question') markActive(current.id); }, [current, view, markActive]);

  useEffect(() => { try { localStorage.setItem(flagKey, JSON.stringify([...flagged])); } catch { /* stockage indisponible */ } }, [flagged, flagKey]);

  const submit = useCallback(async () => {
    if (submitting || result) return;
    setSubmitting(true);
    setConfirmOpen(false);
    setError('');
    try {
      const res = await fetch(`/api/exams/${exam.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: toPayload(questions, answers), proctoring: snapshot() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'La remise a échoué');
      setResult(data.submission ?? data);
      setView('result');
      try { localStorage.removeItem(flagKey); } catch { /* */ }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [submitting, result, exam.id, questions, answers, snapshot, flagKey]);

  // minuteur calcule depuis l'heure de fin donnee par le serveur ; remise automatique a 0
  useEffect(() => {
    if (view === 'result') return;
    const end = new Date(expiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0 && !autoSubmitted.current) { autoSubmitted.current = true; submit(); }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt, view, submit]);

  // enregistrement automatique (1,2 s apres la derniere modification reelle des reponses)
  useEffect(() => {
    if (view === 'result') return;
    const body = JSON.stringify({ answers: toPayload(questions, answers) });
    if (lastSaved.current === null) { lastSaved.current = body; return; } // etat initial (deja sur le serveur)
    if (body === lastSaved.current) { setSaveState((s) => (s === 'saving' ? 'saved' : s)); return; }
    setSaveState('saving');
    const id = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/exams/${exam.id}/attempt`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
        });
        if (!res.ok) throw new Error();
        lastSaved.current = body;
        setSaveState('saved');
        setSavedAt(new Date());
      } catch {
        setSaveState('error');
      }
    }, 1200);
    return () => window.clearTimeout(id);
  }, [answers, exam.id, questions, view]);

  const choose = useCallback((q: RunnerQuestion, optionId: string) => {
    setAnswers((prev) => {
      const a = prev[q.id] ?? { ids: [], text: '' };
      const ids = q.questionType === 'MULTIPLE'
        ? (a.ids.includes(optionId) ? a.ids.filter((x) => x !== optionId) : [...a.ids, optionId])
        : [optionId];
      return { ...prev, [q.id]: { ...a, ids } };
    });
  }, []);
  const toggleFlag = useCallback((id: string) => {
    setFlagged((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const go = useCallback((i: number) => { setIdx(Math.max(0, Math.min(n - 1, i))); setView('question'); }, [n]);

  // raccourcis clavier (desactives pendant la saisie d'une reponse redigee)
  useEffect(() => {
    if (view !== 'question' || !current) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (idx < n - 1) go(idx + 1); else setView('review'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(idx - 1); }
      else if (e.key.toLowerCase() === 'f') { e.preventDefault(); toggleFlag(current.id); }
      else if (current.questionType !== 'TEXT_ESSAY') {
        const k = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : LETTERS.indexOf(e.key.toUpperCase());
        if (k >= 0 && k < current.options.length && e.key.length === 1) { e.preventDefault(); choose(current, current.options[k].id); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, current, idx, n, go, toggleFlag, choose]);

  const unanswered = n - answeredCount;
  const flaggedCount = questions.filter((q) => flagged.has(q.id)).length;
  const timerClass = secondsLeft <= 60 ? 'bg-rose-600 text-white animate-pulse' : secondsLeft <= 300 ? 'bg-amber-100 text-amber-900' : 'bg-white/10 text-white ring-1 ring-white/15';
  // part du temps restant (anneau du minuteur) : duree de l'examen si connue, sinon temps restant a l'ouverture
  const totalSeconds = useRef(Math.max(1, (exam.duration ?? 0) * 60 || secondsLeft));
  const timeFraction = Math.min(1, secondsLeft / totalSeconds.current);
  const face = proctor.lastFrame;
  const faceStatus = !consentWebcam ? null
    : proctor.webcamStatus !== 'on' ? null
    : !face ? { ok: true, text: 'Analyse en cours…' }
    : face.no_of_face >= 2 ? { ok: false, text: 'Plusieurs visages détectés' }
    : face.face_present ? { ok: true, text: 'Visage détecté' }
    : { ok: false, text: 'Visage non détecté — placez-vous face à la caméra' };

  // ------------------------------------------------------------------ resultat
  if (view === 'result' && result) {
    const pct = result.totalScore > 0 ? Math.round((100 * result.score) / result.totalScore) : 0;
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden eg-aurora p-6">
        <div className="eg-grid-bg absolute inset-0" />
        <div className="relative w-full max-w-md animate-fade-up rounded-3xl bg-white p-8 text-center shadow-2xl">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"><Icon name="check" className="h-7 w-7" strokeWidth={2.6} /></span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Copie remise</h1>
          <p className="mt-1 text-sm text-slate-500">{exam.title}</p>
          <div className="mt-6 flex items-center justify-center gap-5 rounded-2xl bg-slate-50 p-5">
            <ProgressRing value={result.status === 'GRADED' ? pct / 100 : 0} size={96} stroke={9} color={pct >= 50 ? '#10b981' : '#f59e0b'}>
              <span className="text-lg">{result.status === 'GRADED' ? `${pct}%` : '…'}</span>
            </ProgressRing>
            <div className="text-start">
              <p className="text-4xl font-bold tracking-tight text-slate-900">{result.score}<span className="text-xl text-slate-400"> / {result.totalScore}</span></p>
              <p className="mt-1 text-sm text-slate-500">{result.status === 'GRADED' ? 'Corrigée automatiquement' : 'Réponses rédigées : correction par l’enseignant'}</p>
            </div>
          </div>
          <p className="mt-5 flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-start text-xs text-brand-800"><Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />Votre session a été analysée par ExamGuard AI. Un score de surveillance n’est jamais une preuve : votre enseignant décide.</p>
          <button onClick={onClose} className="eg-btn eg-btn-primary eg-btn-lg mt-6 w-full">Retour au tableau de bord</button>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ examen
  return (
    <div className="min-h-screen bg-[#f5f6fb] text-slate-900">
      <header className="sticky top-0 z-30 bg-ink-950 text-white shadow-lg shadow-ink-950/10">
        <div className="pointer-events-none absolute inset-0 eg-aurora opacity-40" />
        <div className="relative mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <LogoMark className="hidden h-9 w-9 sm:block" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-glow-400">Examen en cours · {answeredCount}/{n} répondues</p>
            <h1 className="truncate text-base font-semibold md:text-lg">{exam.title}</h1>
          </div>
          <span className={`hidden items-center gap-1.5 rounded-full px-3 py-1 text-xs sm:flex ${saveState === 'error' ? 'bg-rose-500/20 text-rose-200' : 'bg-white/10 text-slate-300'}`} aria-live="polite">
            <Icon name={saveState === 'error' ? 'alert' : saveState === 'saving' ? 'refresh' : 'check'} className={`h-3.5 w-3.5 ${saveState === 'saving' ? 'animate-spin' : ''}`} />
            {saveState === 'saving' ? 'Enregistrement…' : saveState === 'saved' && savedAt ? `Enregistré à ${savedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : saveState === 'error' ? 'Non enregistré — nouvel essai à la prochaine réponse' : 'Sauvegarde automatique'}
          </span>
          <div className={`flex items-center gap-2.5 rounded-2xl py-1.5 pe-3.5 ps-1.5 ${timerClass}`} role="timer" aria-label="Temps restant">
            <ProgressRing value={timeFraction} size={34} stroke={4} color={secondsLeft <= 60 ? '#fff' : secondsLeft <= 300 ? '#d97706' : '#22d3ee'}><span /></ProgressRing>
            <span className="font-mono text-lg font-bold tabular-nums">{fmt(secondsLeft)}</span>
          </div>
        </div>
        <div className="relative h-1 bg-white/10"><div className="h-1 bg-gradient-to-r from-brand-400 to-glow-400 transition-all" style={{ width: `${(100 * answeredCount) / Math.max(n, 1)}%` }} /></div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_300px]">
        <section>
          {error && <div className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          {view === 'question' && current ? (
            <article className="eg-card p-6 md:p-8 animate-fade-up">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">Question {idx + 1} sur {n}</span>
                <span className="text-xs font-medium text-slate-500">{TYPE_LABEL[current.questionType]} · {current.points} pt{current.points > 1 ? 's' : ''}</span>
              </div>
              <h2 className="mt-5 text-xl font-semibold leading-snug md:text-2xl">{current.text}</h2>
              {current.imageUrl && <img src={current.imageUrl} alt="Illustration de la question" className="mt-4 max-h-72 rounded-2xl object-contain" />}

              {current.questionType === 'TEXT_ESSAY' ? (
                <div className="mt-6">
                  <textarea
                    value={answers[current.id]?.text ?? ''}
                    onChange={(e) => setAnswers((p) => ({ ...p, [current.id]: { ids: [], text: e.target.value } }))}
                    rows={8}
                    placeholder="Rédigez votre réponse…"
                    className="eg-input min-h-48 text-[15px] leading-relaxed"
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">{(answers[current.id]?.text ?? '').length} caractères</p>
                </div>
              ) : (
                <div className="mt-6 grid gap-3" role={current.questionType === 'MULTIPLE' ? 'group' : 'radiogroup'}>
                  {current.questionType === 'MULTIPLE' && <p className="text-xs text-slate-500">Plusieurs réponses possibles.</p>}
                  {current.options.map((o, k) => {
                    const selected = answers[current.id]?.ids.includes(o.id) ?? false;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role={current.questionType === 'MULTIPLE' ? 'checkbox' : 'radio'}
                        aria-checked={selected}
                        onClick={() => choose(current, o.id)}
                        className={`group flex w-full items-center gap-4 rounded-2xl p-4 text-start ring-1 transition duration-150 ${selected ? "bg-brand-50 ring-2 ring-brand-500 shadow-sm" : "bg-white ring-slate-200 hover:-translate-y-px hover:ring-brand-200 hover:shadow-sm"}`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${selected ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'}`}>{LETTERS[k]}</span>
                        <span className="flex-1">
                          {o.text}
                          {o.imageUrl && <img src={o.imageUrl} alt="" className="mt-2 max-h-32 rounded-lg object-contain" />}
                        </span>
                        {selected && <span className="text-brand-600" aria-hidden>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <button onClick={() => go(idx - 1)} disabled={idx === 0} className="eg-btn eg-btn-ghost disabled:opacity-30">← Précédente</button>
                <button
                  onClick={() => toggleFlag(current.id)}
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${flagged.has(current.id) ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'}`}
                >
                  {flagged.has(current.id) ? '★ À revoir' : '☆ Marquer à revoir'}
                </button>
                {idx < n - 1 ? (
                  <button onClick={() => go(idx + 1)} className="eg-btn eg-btn-primary">Suivante →</button>
                ) : (
                  <button onClick={() => setView('review')} className="eg-btn eg-btn-success">Vérifier et remettre</button>
                )}
              </div>
              <p className="mt-4 hidden items-center justify-center gap-3 text-xs text-slate-400 md:flex">
                <span><kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">←</kbd> <kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">→</kbd> naviguer</span>
                {current.questionType !== 'TEXT_ESSAY' && <span><kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">A</kbd>–<kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">{LETTERS[Math.max(current.options.length - 1, 0)]}</kbd> répondre</span>}
                <span><kbd className="rounded-md bg-slate-100 px-1.5 py-0.5 font-sans font-semibold text-slate-600 ring-1 ring-slate-200">F</kbd> à revoir</span>
              </p>
            </article>
          ) : (
            <article className="eg-card p-6 md:p-8 animate-fade-up">
              <h2 className="text-2xl font-black">Vérifier avant de remettre</h2>
              <p className="mt-1 text-sm text-slate-500">Cliquez sur une question pour y revenir.</p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-brand-50 p-4"><p className="text-3xl font-black text-brand-700">{answeredCount}</p><p className="text-xs text-brand-700">répondues</p></div>
                <div className={`rounded-2xl p-4 ${unanswered ? 'bg-rose-50' : 'bg-slate-50'}`}><p className={`text-3xl font-black ${unanswered ? 'text-rose-600' : 'text-slate-400'}`}>{unanswered}</p><p className="text-xs text-slate-600">sans réponse</p></div>
                <div className="rounded-2xl bg-amber-50 p-4"><p className="text-3xl font-black text-amber-600">{flagged.size}</p><p className="text-xs text-amber-700">à revoir</p></div>
              </div>
              <ul className="mt-6 grid gap-2 sm:grid-cols-2">
                {questions.map((q, i) => (
                  <li key={q.id}>
                    <button onClick={() => go(i)} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${isAnswered(answers[q.id]) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{i + 1}</span>
                      <span className="line-clamp-1 flex-1 text-sm">{q.text}</span>
                      {flagged.has(q.id) && <span className="text-amber-500" title="À revoir">★</span>}
                      {!isAnswered(answers[q.id]) && <span className="text-xs font-semibold text-rose-500">vide</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-5">
                <button onClick={() => go(idx)} className="eg-btn eg-btn-ghost">← Retour aux questions</button>
                <button onClick={() => setConfirmOpen(true)} disabled={submitting} className="eg-btn eg-btn-success eg-btn-lg">{submitting ? 'Remise…' : 'Remettre la copie'}</button>
              </div>
            </article>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:h-fit">
          <div className="eg-card p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">Questions</h3>
              <span className="text-xs text-slate-500">{answeredCount}/{n} répondues</span>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2">
              {questions.map((q, i) => {
                const done = isAnswered(answers[q.id]);
                const isCur = view === 'question' && i === idx;
                return (
                  <button
                    key={q.id}
                    onClick={() => go(i)}
                    aria-label={`Question ${i + 1}${done ? ', répondue' : ''}${flagged.has(q.id) ? ', à revoir' : ''}`}
                    className={`relative h-10 rounded-xl text-sm font-bold transition ${done ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${isCur ? 'ring-2 ring-brand-600 ring-offset-2' : ''}`}
                  >
                    {i + 1}
                    {flagged.has(q.id) && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" />}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-brand-600" /> répondue</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-slate-200" /> sans réponse</span>
              <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400" /> à revoir</span>
            </div>
            <button onClick={() => setView('review')} className="eg-btn mt-4 w-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100">Vérifier et remettre</button>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white shadow-lg shadow-ink-950/10"><div className="pointer-events-none absolute inset-0 eg-aurora opacity-30" /><div className="relative">
            <div className="flex items-center gap-2 text-sm font-bold">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              Surveillance ExamGuard AI
            </div>
            {consentWebcam && (
              <video ref={proctor.videoRef} muted playsInline className="mt-3 aspect-[4/3] w-full rounded-2xl bg-slate-800 object-cover" style={{ transform: 'scaleX(-1)' }} />
            )}
            <dl className="mt-3 space-y-1.5 text-xs text-slate-300">
              <div className="flex justify-between gap-2"><dt>Webcam</dt><dd className="text-right text-white">{{ off: 'désactivée', loading: 'démarrage…', on: `active · ${proctor.frameCount} relevés`, denied: 'accès refusé', error: 'indisponible' }[proctor.webcamStatus]}</dd></div>
              {faceStatus && <div className="flex justify-between gap-2"><dt>Cadrage</dt><dd className={`text-right ${faceStatus.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{faceStatus.text}</dd></div>}
              <div className="flex justify-between gap-2"><dt>Temps par question</dt><dd className="text-white">mesuré</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-400">Seuls des indicateurs sont envoyés, jamais d’image ni de vidéo. Un score n’est pas une preuve : l’enseignant décide.</p>
          </div></div>
        </aside>
      </main>

      {confirmOpen && (
        <div className="eg-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="eg-confirm">
          <div className="eg-modal max-w-sm space-y-4">
            <h3 id="eg-confirm" className="text-xl font-black">Remettre la copie ?</h3>
            <p className="text-sm text-slate-600">
              {unanswered > 0 ? <><strong className="text-rose-600">{unanswered} question{unanswered > 1 ? 's' : ''} sans réponse.</strong> </> : 'Toutes les questions ont une réponse. '}
              {flaggedCount > 0 && <><strong className="text-amber-600">{flaggedCount} encore marquée{flaggedCount > 1 ? 's' : ''} « à revoir ».</strong> </>}
              Vous ne pourrez plus modifier vos réponses.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmOpen(false)} className="eg-btn eg-btn-secondary">Annuler</button>
              <button onClick={submit} className="eg-btn eg-btn-success">Remettre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
