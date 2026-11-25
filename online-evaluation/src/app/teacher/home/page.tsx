'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ClassView, ExamView, QuestionView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import Link from 'next/link';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, IconBubble, ProgressRing, StatCard } from '@/components/ui/kit';
import { ColumnChart, Meter } from '@/components/ui/charts';

interface ExamStats { id: string; submissions: number; toGrade: number; average: number | null; passRate: number | null; alerts: number; pendingAlerts: number }
interface Overview {
  totals: { exams: number; published: number; submissions: number; average: number | null; toGrade: number; pendingAlerts: number; emptyDrafts: number };
  perExam: ExamStats[];
  daily: { date: string; count: number }[];
  distribution: { from: number; to: number; count: number }[];
  recent: { id: string; student: string; exam: string; at: string; status: string; score: number; totalScore: number; alert: boolean; risk: number | null }[];
}
const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(100 * v)} %`);
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'à l’instant';
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
};

type Option = { text: string; isCorrect: boolean; imageUrl: string };
const blankOptions = (): Option[] => [{ text: '', isCorrect: false, imageUrl: '' }, { text: '', isCorrect: false, imageUrl: '' }];
const QUESTION_TYPES = [
  { value: 'SINGLE', icon: 'check', label: 'Choix unique' },
  { value: 'MULTIPLE', icon: 'layers', label: 'Choix multiple' },
  { value: 'BOOLEAN', icon: 'target', label: 'Vrai / faux' },
  { value: 'TEXT_ESSAY', icon: 'pen', label: 'Rédaction' },
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(QUESTION_TYPES.map((q) => [q.value, q.label]));

export default function TeacherHome() {
  useRoleGuard('TEACHER');

  const [exams, setExams] = useState<ExamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all');
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);

  // editeur de questions (panneau lateral)
  const [selectedExam, setSelectedExam] = useState<ExamView | null>(null);
  const [questionType, setQuestionType] = useState<string>('SINGLE');
  const [questionText, setQuestionText] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [uploadingCount, setUploadingCount] = useState(0);
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<Option[]>(blankOptions);

  // tableau de bord
  const [overview, setOverview] = useState<Overview | null>(null);
  const [me, setMe] = useState<string>('');

  useEffect(() => {
    fetchExams();
    fetch('/api/classes').then((r) => r.json()).then((data) => setClasses(data.classes || [])).catch(() => {});
    fetch('/api/auth/me').then((r) => r.json()).then((d) => setMe(d.user?.name || '')).catch(() => {});
  }, []);

  const fetchOverview = () => fetch('/api/teacher/overview', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setOverview(d)).catch(() => {});

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (res.ok) setExams(data.exams || []);
      fetchOverview();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/exams', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, duration: Number(duration), passingScore: Number(passingScore), classId: classId || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowCreateModal(false);
        setTitle(''); setDescription(''); setDuration(30);
        await fetchExams();
        setNotice(`Examen « ${data.exam?.title ?? title} » créé. Ajoutez maintenant ses questions.`);
        if (data.exam?.id) openQuestions(data.exam);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resetQuestionForm = () => {
    setQuestionText(''); setQuestionImageUrl(''); setPoints(1);
    setOptions(questionType === 'BOOLEAN' ? [{ text: 'Vrai', isCorrect: false, imageUrl: '' }, { text: 'Faux', isCorrect: false, imageUrl: '' }] : blankOptions());
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExam) return;
    setQuestionError('');
    try {
      const res = await fetch(`/api/exams/${selectedExam.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: questionText, imageUrl: questionImageUrl, points: Number(points), questionType, options: questionType === 'TEXT_ESSAY' ? [] : options }),
      });
      if (res.ok) {
        resetQuestionForm();
        const examRes = await fetch(`/api/exams/${selectedExam.id}`);
        const examData = await examRes.json();
        if (examRes.ok) setSelectedExam(examData.exam);
        fetchExams();
      } else {
        const data = await res.json();
        setQuestionError(data.error || 'Impossible d’ajouter cette question');
      }
    } catch (err) {
      console.error(err);
      setQuestionError('Impossible d’ajouter cette question. Vérifiez votre connexion et réessayez.');
    }
  };

  const uploadImage = async (file: File, onUploaded: (url: string) => void) => {
    setUploadingCount((c) => c + 1);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await fetch('/api/uploads/images', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import de l’image impossible');
      onUploaded(data.url);
    } catch (error) {
      setQuestionError(error instanceof Error ? error.message : 'Import de l’image impossible');
    } finally {
      setUploadingCount((c) => Math.max(0, c - 1));
    }
  };

  const openQuestions = async (exam: ExamView | { id: string }) => {
    const res = await fetch(`/api/exams/${exam.id}`);
    const data = await res.json();
    if (res.ok) { setSelectedExam(data.exam); setQuestionError(''); }
  };

  const togglePublished = async (exam: ExamView) => {
    const res = await fetch(`/api/exams/${exam.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ published: !exam.published }) });
    if (res.ok) { fetchExams(); setNotice(exam.published ? `« ${exam.title} » repassé en brouillon.` : `« ${exam.title} » publié : les étudiants peuvent le passer.`); }
    else { const data = await res.json(); setNotice(data.error || 'Mise à jour impossible'); }
  };

  const stats = useMemo(() => ({
    total: exams.length,
    published: exams.filter((e) => e.published).length,
    draft: exams.filter((e) => !e.published).length,
    questions: exams.reduce((s, e) => s + (e._count?.questions || 0), 0),
  }), [exams]);
  const shown = exams
    .filter((e) => filter === 'all' || (filter === 'published' ? e.published : !e.published))
    .filter((e) => !query.trim() || `${e.title} ${e.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()));
  const totalPoints = selectedExam?.questions?.reduce((s, q) => s + q.points, 0) ?? 0;

  return (
    <AppShell role="TEACHER" active="exams" actions={<button onClick={() => setShowCreateModal(true)} className="eg-btn eg-btn-primary hidden sm:inline-flex"><Icon name="plus" className="h-4 w-4" />Nouvel examen</button>}>
      {/* accueil : ce qui attend l'enseignant */}
      <div className="relative overflow-hidden rounded-3xl eg-aurora p-6 text-white md:p-8">
        <div className="eg-grid-bg absolute inset-0" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-sm font-medium capitalize text-slate-300">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Bonjour{me ? `, ${me.split(' ')[0]}` : ''} 👋</h1>
            <p className="mt-2 text-slate-300">
              {overview && (overview.totals.pendingAlerts || overview.totals.toGrade)
                ? <>Vous avez <strong className="text-white">{overview.totals.pendingAlerts} alerte{overview.totals.pendingAlerts > 1 ? 's' : ''}</strong> à examiner et <strong className="text-white">{overview.totals.toGrade} copie{overview.totals.toGrade > 1 ? 's' : ''}</strong> à corriger.</>
                : 'Tout est à jour. Préparez votre prochain examen.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {!!overview?.totals.pendingAlerts && <Link href="/teacher/surveillance" className="eg-btn bg-white text-ink-950 hover:bg-slate-100"><Icon name="shield" className="h-4 w-4" />Examiner les alertes<span className="rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{overview.totals.pendingAlerts}</span></Link>}
              {!!overview?.totals.toGrade && <Link href="/teacher/grading" className="eg-btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"><Icon name="pen" className="h-4 w-4" />Corriger<span className="rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink-950">{overview.totals.toGrade}</span></Link>}
              <button onClick={() => setShowCreateModal(true)} className="eg-btn bg-white/10 text-white ring-1 ring-white/20 hover:bg-white/15"><Icon name="plus" className="h-4 w-4" />Nouvel examen</button>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
            <ProgressRing value={overview?.totals.average ?? 0} size={76} stroke={8} color="#22d3ee"><span className="text-white">{pct(overview?.totals.average).replace(' ', '')}</span></ProgressRing>
            <div><p className="text-sm font-semibold">Moyenne des copies notées</p><p className="text-xs text-slate-300">{overview?.totals.submissions ?? 0} copie{(overview?.totals.submissions ?? 0) > 1 ? 's' : ''} remise{(overview?.totals.submissions ?? 0) > 1 ? 's' : ''}</p></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Copies remises" value={overview?.totals.submissions ?? '—'} icon="check" tone="brand" hint={overview ? `${overview.daily.slice(-7).reduce((s, d) => s + d.count, 0)} ces 7 derniers jours` : undefined} />
        <StatCard label="Examens publiés" value={`${stats.published} / ${stats.total}`} icon="globe" tone="green" hint={`${stats.questions} questions au total`} />
        <StatCard label="Alertes à examiner" value={overview?.totals.pendingAlerts ?? '—'} icon="alert" tone="red" />
        <StatCard label="Copies à corriger" value={overview?.totals.toGrade ?? '—'} icon="pen" tone="amber" hint={overview?.totals.emptyDrafts ? `${overview.totals.emptyDrafts} brouillon(s) sans question` : undefined} />
      </div>

      {overview && (
        <div className="mt-6 grid gap-5 xl:grid-cols-[1.25fr_1fr]">
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
            <section className="eg-card p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2"><h2 className="eg-h2">Copies remises — 14 derniers jours</h2><span className="text-xs text-slate-500">par jour</span></div>
              <ColumnChart height={170} ariaLabel="Nombre de copies remises par jour sur les 14 derniers jours" valueHeader="Copies" labelEvery={2}
                data={overview.daily.map((d) => { const dt = new Date(`${d.date}T12:00:00`); return { key: d.date, label: String(dt.getDate()), value: d.count, tip: dt.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) }; })} />
            </section>
            <section className="eg-card p-5">
              <div className="mb-3 flex items-baseline justify-between gap-2"><h2 className="eg-h2">Répartition des notes</h2><span className="text-xs text-slate-500">copies notées, en % du total</span></div>
              <ColumnChart height={170} ariaLabel="Nombre de copies par tranche de note" valueHeader="Copies"
                data={overview.distribution.map((b) => ({ key: String(b.from), label: `${b.from}`, value: b.count, tip: `${b.from}–${b.to} %` }))} />
            </section>
          </div>
          <section className="eg-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="eg-h2">Activité récente</h2><Link href="/teacher/surveillance" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Tout voir</Link></div>
            {overview.recent.length === 0 ? <div className="p-5"><EmptyState icon="activity" title="Aucune copie remise" text="Les remises apparaîtront ici en temps réel." /></div> : (
              <ul className="divide-y divide-slate-100">
                {overview.recent.map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3">
                    <Avatar name={r.student} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{r.student}</p>
                      <p className="truncate text-xs text-slate-500">{r.exam} · {ago(r.at)}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{r.score} / {r.totalScore}</p>
                      {r.alert ? <span className="eg-badge eg-badge-red mt-0.5">Alerte {pct(r.risk)}</span> : r.status === 'SUBMITTED' ? <span className="eg-badge eg-badge-amber mt-0.5">À corriger</span> : <span className="eg-badge eg-badge-green mt-0.5">Notée</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {notice && <div className="eg-alert eg-alert-info mt-5 flex items-center justify-between gap-3">{notice}<button onClick={() => setNotice('')} aria-label="Fermer"><Icon name="x" className="h-4 w-4" /></button></div>}

      <div className="mb-4 mt-10 flex flex-wrap items-end justify-between gap-3">
        <div><p className="eg-eyebrow">Enseignement</p><h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Mes examens</h2></div>
      </div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="eg-segmented" role="group" aria-label="Filtrer">
          {([['all', 'Tous', stats.total], ['published', 'Publiés', stats.published], ['draft', 'Brouillons', stats.draft]] as const).map(([k, label, n]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}>{label} <span className="ms-1 text-xs text-slate-400">{n}</span></button>
          ))}
        </div>
        <div className="relative">
          <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un examen…" className="eg-input w-64 ps-9" aria-label="Rechercher un examen" />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="eg-card h-52 animate-pulse bg-slate-100/60" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState icon="exam" title={exams.length ? 'Aucun examen pour ce filtre' : 'Aucun examen pour l’instant'} text={exams.length ? 'Changez de filtre ou de recherche.' : 'Créez votre premier examen : titre, durée, puis questions.'}
          action={!exams.length && <button onClick={() => setShowCreateModal(true)} className="eg-btn eg-btn-primary"><Icon name="plus" className="h-4 w-4" />Créer un examen</button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((exam) => {
            const nq = exam._count?.questions || 0;
            return (
              <article key={exam.id} className="eg-card eg-card-hover flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <IconBubble icon="exam" tone={exam.published ? 'green' : 'amber'} />
                  <span className={`eg-badge ${exam.published ? 'eg-badge-green' : 'eg-badge-amber'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${exam.published ? 'bg-emerald-500' : 'bg-amber-500'}`} />{exam.published ? 'Publié' : 'Brouillon'}
                  </span>
                </div>
                <h3 className="mt-4 line-clamp-2 font-semibold text-slate-900">{exam.title}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">{exam.description || 'Pas de description.'}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Icon name="clock" className="h-3.5 w-3.5" />{exam.duration} min</span>
                  <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${nq ? 'bg-slate-50' : 'bg-rose-50 text-rose-600'}`}><Icon name="help" className="h-3.5 w-3.5" />{nq} question{nq > 1 ? 's' : ''}</span>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2 py-1"><Icon name="target" className="h-3.5 w-3.5" />réussite {exam.passingScore} %</span>
                </div>
                {!nq && !exam.published && <p className="mt-3 text-xs text-rose-600">Ajoutez au moins une question avant de publier.</p>}
                {(() => {
                  const s = overview?.perExam.find((p) => p.id === exam.id);
                  if (!s || !s.submissions) return <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs text-slate-500">Aucune copie remise pour l’instant.</p>;
                  return (
                    <div className="mt-4 rounded-xl bg-slate-50 p-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div><p className="text-base font-bold text-slate-900">{s.submissions}</p><p className="text-[11px] text-slate-500">copies</p></div>
                        <div><p className="text-base font-bold text-slate-900">{pct(s.average)}</p><p className="text-[11px] text-slate-500">moyenne</p></div>
                        <div><p className={`text-base font-bold ${s.pendingAlerts ? 'text-rose-600' : 'text-slate-900'}`}>{s.alerts}</p><p className="text-[11px] text-slate-500">alerte{s.alerts > 1 ? 's' : ''}{s.pendingAlerts ? ` · ${s.pendingAlerts} à voir` : ''}</p></div>
                      </div>
                      {s.passRate != null && (
                        <div className="mt-3">
                          <div className="mb-1 flex justify-between text-[11px] text-slate-500"><span>Taux de réussite</span><span className="font-semibold text-slate-700">{pct(s.passRate)}</span></div>
                          <Meter value={s.passRate} tone={s.passRate >= 0.5 ? 'green' : 'amber'} />
                        </div>
                      )}
                    </div>
                  );
                })()}
                <div className="mt-auto flex gap-2 pt-5">
                  <button onClick={() => openQuestions(exam)} className="eg-btn eg-btn-soft flex-1"><Icon name="layers" className="h-4 w-4" />Questions</button>
                  <button onClick={() => togglePublished(exam)} className={`eg-btn flex-1 ${exam.published ? 'eg-btn-secondary' : 'eg-btn-primary'}`}>
                    <Icon name={exam.published ? 'eye' : 'globe'} className="h-4 w-4" />{exam.published ? 'Dépublier' : 'Publier'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* creation d'examen */}
      {showCreateModal && (
        <div className="eg-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-title">
          <form onSubmit={handleCreateExam} className="eg-modal space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3"><IconBubble icon="plus" /><div><h3 id="create-title" className="text-lg font-bold">Nouvel examen</h3><p className="text-sm text-slate-500">Vous ajouterez les questions juste après.</p></div></div>
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Fermer"><Icon name="x" /></button>
            </div>
            <label className="block"><span className="eg-label">Titre</span><input required value={title} onChange={(e) => setTitle(e.target.value)} className="eg-input" placeholder="Ex. : Partiel d’algorithmique" /></label>
            <label className="block"><span className="eg-label">Description</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="eg-input" placeholder="Objectifs, consignes…" /></label>
            <div className="grid grid-cols-2 gap-4">
              <label><span className="eg-label">Durée (minutes)</span><input type="number" required min={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="eg-input" /></label>
              <label><span className="eg-label">Seuil de réussite (%)</span><input type="number" min={0} max={100} value={passingScore} onChange={(e) => setPassingScore(Number(e.target.value))} className="eg-input" /></label>
            </div>
            <label className="block"><span className="eg-label">Classe (facultatif)</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="eg-input">
                <option value="">Ouvert à tous les étudiants</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <button type="button" onClick={() => setShowCreateModal(false)} className="eg-btn eg-btn-secondary">Annuler</button>
              <button type="submit" className="eg-btn eg-btn-primary">Créer et ajouter des questions <Icon name="arrowRight" className="h-4 w-4" /></button>
            </div>
          </form>
        </div>
      )}

      {/* editeur de questions : panneau lateral */}
      {selectedExam && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="q-title">
          <button className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedExam(null)} aria-label="Fermer" />
          <div className="relative flex h-full w-full max-w-2xl flex-col bg-[#f5f6fb] shadow-2xl animate-fade-in">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
              <div className="min-w-0">
                <p className="eg-eyebrow">Éditeur de questions</p>
                <h3 id="q-title" className="mt-1 truncate text-lg font-bold">{selectedExam.title}</h3>
                <p className="text-sm text-slate-500">{selectedExam.questions?.length || 0} question{(selectedExam.questions?.length || 0) > 1 ? 's' : ''} · {totalPoints} point{totalPoints > 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setSelectedExam(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Fermer"><Icon name="x" /></button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <div className="space-y-3">
                {(selectedExam.questions?.length ?? 0) === 0 && <EmptyState icon="help" title="Aucune question" text="Ajoutez la première question avec le formulaire ci-dessous." />}
                {selectedExam.questions?.map((q: QuestionView, idx: number) => (
                  <div key={q.id} className="eg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600 text-xs font-bold text-white">{idx + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{q.text}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{TYPE_LABEL[q.questionType] ?? q.questionType} · {q.points} pt{q.points > 1 ? 's' : ''}</p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {q.imageUrl && <img src={q.imageUrl} alt="Illustration" className="mt-3 max-h-40 rounded-xl bg-white object-contain ring-1 ring-slate-200" />}
                        {q.questionType !== 'TEXT_ESSAY' && (
                          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                            {q.options?.map((opt) => (
                              <li key={opt.id} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm ${opt.isCorrect ? 'bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-600'}`}>
                                <Icon name={opt.isCorrect ? 'check' : 'x'} className={`h-3.5 w-3.5 ${opt.isCorrect ? '' : 'text-slate-300'}`} strokeWidth={2.4} />
                                <span className="truncate">{opt.text}</span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                {opt.imageUrl && <img src={opt.imageUrl} alt="" className="ms-auto h-8 w-8 rounded object-cover" />}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handleAddQuestion} className="eg-card space-y-5 p-5">
                <p className="eg-h2 flex items-center gap-2"><Icon name="plus" className="h-4 w-4 text-brand-600" />Ajouter une question</p>
                {questionError && <p role="alert" className="eg-alert eg-alert-error">{questionError}</p>}
                <div>
                  <span className="eg-label">Type</span>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {QUESTION_TYPES.map((qt) => (
                      <button key={qt.value} type="button" aria-pressed={questionType === qt.value}
                        onClick={() => { setQuestionType(qt.value); if (qt.value === 'BOOLEAN') setOptions([{ text: 'Vrai', isCorrect: false, imageUrl: '' }, { text: 'Faux', isCorrect: false, imageUrl: '' }]); }}
                        className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-xs font-semibold ring-1 transition ${questionType === qt.value ? 'bg-brand-50 text-brand-700 ring-2 ring-brand-500' : 'bg-white text-slate-600 ring-slate-200 hover:ring-slate-300'}`}>
                        <Icon name={qt.icon} className="h-4 w-4" />{qt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block"><span className="eg-label">Énoncé</span><textarea required rows={2} value={questionText} onChange={(e) => setQuestionText(e.target.value)} className="eg-input" placeholder="Ex. : Quelle est la complexité d’une recherche dichotomique ?" /></label>
                <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
                  <label><span className="eg-label">Points</span><input type="number" required min={1} value={points} onChange={(e) => setPoints(Number(e.target.value))} className="eg-input" /></label>
                  <div>
                    <span className="eg-label">Image (facultatif)</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadImage(file, setQuestionImageUrl); e.currentTarget.value = ''; }} className="eg-file" />
                    {questionImageUrl && (
                      <div className="mt-2 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={questionImageUrl} alt="Aperçu" className="h-14 rounded-lg bg-white object-contain ring-1 ring-slate-200" />
                        <button type="button" onClick={() => setQuestionImageUrl('')} className="text-xs font-semibold text-rose-600">Retirer</button>
                      </div>
                    )}
                  </div>
                </div>

                {questionType !== 'TEXT_ESSAY' && (
                  <div className="space-y-2">
                    <span className="eg-label">Réponses <span className="font-normal text-slate-500">— {questionType === 'MULTIPLE' ? 'cochez toutes les bonnes réponses' : 'cochez la bonne réponse'}</span></span>
                    {options.map((opt, index) => (
                      <div key={index} className={`flex items-center gap-2 rounded-xl p-2 ring-1 transition ${opt.isCorrect ? 'bg-emerald-50/60 ring-emerald-300' : 'bg-white ring-slate-200'}`}>
                        <button type="button" aria-pressed={opt.isCorrect} title="Bonne réponse"
                          onClick={() => setOptions(options.map((o, i) => ({ ...o, isCorrect: i === index ? !o.isCorrect : questionType === 'MULTIPLE' ? o.isCorrect : false })))}
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold transition ${opt.isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {opt.isCorrect ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : String.fromCharCode(65 + index)}
                        </button>
                        <input required value={opt.text} onChange={(e) => setOptions(options.map((o, i) => (i === index ? { ...o, text: e.target.value } : o)))} className="eg-input py-2" placeholder={`Réponse ${String.fromCharCode(65 + index)}`} />
                        <label className="eg-btn eg-btn-ghost eg-btn-sm cursor-pointer" title="Image"><Icon name="image" className="h-4 w-4" />
                          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadImage(file, (url) => setOptions((cur) => cur.map((o, i) => (i === index ? { ...o, imageUrl: url } : o)))); e.currentTarget.value = ''; }} />
                        </label>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {opt.imageUrl && <img src={opt.imageUrl} alt="" className="h-8 w-8 rounded object-cover" />}
                        {options.length > 2 && <button type="button" onClick={() => setOptions(options.filter((_, i) => i !== index))} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Supprimer la réponse"><Icon name="trash" className="h-4 w-4" /></button>}
                      </div>
                    ))}
                    {questionType !== 'BOOLEAN' && <button type="button" onClick={() => setOptions([...options, { text: '', isCorrect: false, imageUrl: '' }])} className="eg-btn eg-btn-ghost eg-btn-sm"><Icon name="plus" className="h-3.5 w-3.5" />Ajouter une réponse</button>}
                  </div>
                )}

                <div className="flex justify-end border-t border-slate-100 pt-4">
                  <button type="submit" disabled={uploadingCount > 0} className="eg-btn eg-btn-primary">{uploadingCount > 0 ? 'Import de l’image…' : <><Icon name="plus" className="h-4 w-4" />Ajouter la question</>}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
