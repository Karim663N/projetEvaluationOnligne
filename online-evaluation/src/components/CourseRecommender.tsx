'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface RecommendedCourse {
  title: string;
  reason: string;
  difficulty: 'Débutant' | 'Intermédiaire' | 'Avancé' | string;
  focusArea: string;
}

interface AnalysisResult {
  pointsForts: string[];
  pointsAmeliorer: string[];
  competences: string[];
  recommendedCourses: RecommendedCourse[];
}

const difficultyBadge = (difficulty: string) => {
  switch (difficulty.toLowerCase()) {
    case 'débutant': case 'beginner': return 'eg-badge-green';
    case 'intermédiaire': case 'intermediate': return 'eg-badge-brand';
    case 'avancé': case 'advanced': return 'eg-badge-red';
    default: return 'eg-badge-slate';
  }
};

const STEPS = ['Import du CV', 'Lecture par l’IA', 'Recommandations'];

export default function CourseRecommender() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [hasCurrentCv, setHasCurrentCv] = useState(false);

  useEffect(() => {
    fetch('/api/student/cv?meta=1').then((res) => { if (res.ok) return res.json(); throw new Error(); }).then((data) => setHasCurrentCv(Boolean(data.cvUrl))).catch(() => undefined);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== 'application/pdf' && !selectedFile.name.toLowerCase().endsWith('.pdf')) {
        setError('Veuillez télécharger un fichier PDF valide.');
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('Le CV doit faire moins de 10 Mo.');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileChange({ target: { files: [dropped] } } as unknown as React.ChangeEvent<HTMLInputElement>);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) { setError('Veuillez sélectionner un fichier CV au format PDF.'); return; }
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/student/cv', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Impossible d\'enregistrer le CV');
      setHasCurrentCv(true);
      const res = await fetch('/api/recommend-courses', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Erreur lors de l\'analyse du CV');
      setResult(data.data);
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const step = result ? 3 : loading ? 2 : file ? 1 : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <form onSubmit={handleSubmit} className="eg-card p-6">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-violet-500 text-white shadow-lg shadow-brand-500/30"><Icon name="sparkles" /></span>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Analyse IA de votre CV</h2>
              <p className="text-sm text-slate-500">Importez votre CV (PDF) pour obtenir un bilan personnalisé et des formations adaptées.</p>
            </div>
          </div>
          <label onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}
            className={`mt-5 flex h-44 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition ${file ? 'border-brand-300 bg-brand-50/60' : 'border-slate-300 bg-slate-50/60 hover:border-brand-300 hover:bg-brand-50/40'}`}>
            <span className={`grid h-12 w-12 place-items-center rounded-2xl ${file ? 'bg-brand-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}><Icon name={file ? 'check' : 'upload'} /></span>
            {file ? <p className="mt-3 text-sm font-semibold text-brand-700">{file.name}</p> : (
              <>
                <p className="mt-3 text-sm text-slate-600"><span className="font-semibold text-slate-900">Cliquez pour importer</span> ou glissez-déposez</p>
                <p className="mt-0.5 text-xs text-slate-400">PDF · 10 Mo maximum</p>
              </>
            )}
            <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
          </label>
          {error && <div className="eg-alert eg-alert-error mt-4">{error}</div>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            {hasCurrentCv ? <a href="/api/student/cv" target="_blank" rel="noopener noreferrer" className="eg-btn eg-btn-ghost eg-btn-sm"><Icon name="external" className="h-3.5 w-3.5" />Voir mon CV actuel</a> : <span />}
            <button type="submit" disabled={loading || !file} className="eg-btn eg-btn-primary">
              {loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Analyse en cours…</> : <><Icon name="sparkles" className="h-4 w-4" />Analyser et recommander</>}
            </button>
          </div>
        </form>

        <div className="relative overflow-hidden rounded-2xl eg-aurora p-6 text-white">
          <div className="eg-grid-bg absolute inset-0" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-glow-400">Comment ça marche</p>
            <ol className="mt-4 space-y-4">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold ${i < step ? 'bg-emerald-400 text-ink-950' : i === step ? 'bg-white text-ink-950' : 'bg-white/10 text-slate-300 ring-1 ring-white/15'}`}>
                    {i < step ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : i + 1}
                  </span>
                  <span className={`text-sm ${i <= step ? 'font-semibold text-white' : 'text-slate-400'}`}>{s}</span>
                </li>
              ))}
            </ol>
            <p className="mt-6 text-xs leading-relaxed text-slate-300">Votre CV est analysé par Gemini uniquement à votre demande. Les recommandations sont indicatives : parlez-en avec vos enseignants.</p>
          </div>
        </div>
      </div>

      {result && (
        <div className="space-y-5 animate-fade-up">
          <div className="grid gap-5 md:grid-cols-2">
            <section className="eg-card p-6">
              <h3 className="eg-h2 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Icon name="trending" className="h-4 w-4" /></span>Points forts</h3>
              <ul className="mt-4 space-y-2.5">
                {result.pointsForts?.map((point, index) => (
                  <li key={index} className="flex items-start gap-2.5 text-sm text-slate-700"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2.4} />{point}</li>
                ))}
              </ul>
            </section>
            <section className="eg-card p-6">
              <h3 className="eg-h2 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-50 text-brand-600"><Icon name="zap" className="h-4 w-4" /></span>Compétences clés</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {result.competences?.map((comp, index) => <span key={index} className="eg-badge eg-badge-brand py-1">{comp}</span>)}
              </div>
            </section>
          </div>

          <section className="eg-card p-6">
            <h3 className="eg-h2 flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-amber-50 text-amber-600"><Icon name="target" className="h-4 w-4" /></span>Axes d’amélioration</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {result.pointsAmeliorer?.map((point, index) => (
                <div key={index} className="flex items-start gap-2.5 rounded-xl bg-amber-50/70 p-3.5 text-sm text-amber-900 ring-1 ring-amber-100"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />{point}</div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900"><Icon name="book" className="h-5 w-5 text-brand-600" />Formations recommandées</h3>
            <div className="grid gap-4 md:grid-cols-2">
              {result.recommendedCourses?.map((course, index) => (
                <article key={index} className="eg-card eg-card-hover flex flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-semibold text-slate-900">{course.title}</h4>
                    <span className={`eg-badge ${difficultyBadge(course.difficulty)}`}>{course.difficulty}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{course.reason}</p>
                  <p className="mt-auto pt-4"><span className="eg-badge eg-badge-slate">Axe : {course.focusArea}</span></p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
