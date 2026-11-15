'use client';

import React, { useEffect, useState } from 'react';
import { useDynamicText, useT, DynamicText } from '@/lib';

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

export default function CourseRecommender() {
  const tPointsFort = useDynamicText('Key Strengths');
  const tCompetences = useDynamicText('Compétences Clés');
  const tPointsAmeliorer = useDynamicText('Axes d\'Amélioration');
  const tFormations = useDynamicText('Formations Recommandées');

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [, setHasCurrentCv] = useState(false);

  const tTitle = useDynamicText('Title');
  const tReason = useDynamicText('Reason');
  const t = useT();

  useEffect(() => {
    fetch('/api/student/cv?meta=1').then((res) => {
      if (res.ok) return res.json();
      throw new Error();
    }).then((data) => setHasCurrentCv(Boolean(data.cvUrl))).catch(() => undefined);
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

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'débutant':
      case 'beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'intermédiaire':
      case 'intermediate':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'avancé':
      case 'advanced':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Veuillez sélectionner un fichier CV au format PDF.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/student/cv', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Impossible d\'enregistrer le CV');
      setHasCurrentCv(true);

      const res = await fetch('/api/recommend-courses', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Erreur lors de l\'analyse du CV');
      }

      setResult(data.data);
    } catch (err: unknown) {
      const errorObj = err as Error;
      setError(errorObj.message || 'Une erreur inattendue est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 md:p-8">
          <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
            {tTitle}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
            {tReason}
          </p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <label
              htmlFor="cvUpload"
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 p-8 text-center hover:border-emerald-400 hover:bg-emerald-50/30 transition-all"
            >
              <svg className="w-10 h-10 text-slate-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                {tPointsFort}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {tCompetences}
              </span>
            </label>
            <input
              id="cvUpload"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="hidden"
            />
            {error && <p className="text-sm text-rose-600 dark:text-rose-400"><DynamicText text={error} /></p>}
            <button
              type="submit"
              disabled={!file || loading}
              className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all"
            >
              {loading ? t('Analyse en cours...') : t('Analyser le CV')}
            </button>
          </form>
        </div>

        {result && (
          <div className="space-y-8 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                  {tPointsFort}
                </h3>
                <ul className="space-y-2">
                  {result.pointsForts?.map((point, index) => (
                    <li key={index} className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      <DynamicText text={point} />
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                  <span className="w-3 h-3 bg-indigo-500 rounded-full mr-2"></span>
                  {tCompetences}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {result.competences?.map((comp, index) => (
                    <span key={index} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium border border-indigo-100 dark:border-indigo-900">
                      <DynamicText text={comp} />
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="w-3 h-3 bg-amber-500 rounded-full mr-2"></span>
                {tPointsAmeliorer}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.pointsAmeliorer?.map((point, index) => (
                  <div key={index} className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-sm text-amber-900 dark:text-amber-200 flex items-start">
                    <svg className="w-5 h-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <DynamicText text={point} />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {tFormations}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {result.recommendedCourses?.map((course, index) => (
                  <div key={index} className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
                    <div>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <h4 className="font-bold text-gray-900 dark:text-white text-lg"><DynamicText text={course.title} /></h4>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(course.difficulty)}`}>
                          <DynamicText text={course.difficulty} />
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4"><DynamicText text={course.reason} /></p>
                    </div>
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg">
                        {t('Focus:')} <DynamicText text={course.focusArea} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
