'use client';

import React, { useEffect, useState } from 'react';

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

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Upload Card */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 transition-all">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Analyse IA de CV & Recommandations</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Importez votre CV au format PDF pour recevoir un bilan personnalisé et des formations adaptées.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center justify-center w-full">
            <label onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} className="flex flex-col items-center justify-center w-full h-40 border-2 border-gray-300 dark:border-gray-700 border-dashed rounded-xl cursor-pointer bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                <svg className="w-10 h-10 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {file ? (
                  <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">{file.name}</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Cliquez pour importer</span> ou glissez-déposez</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">PDF (MAX. 10Mo)</p>
                  </>
                )}
              </div>
              <input type="file" className="hidden" accept="application/pdf" onChange={handleFileChange} />
            </label>
          </div>

          {hasCurrentCv && <a href="/api/student/cv" target="_blank" rel="noopener noreferrer" className="inline-flex text-sm font-semibold text-indigo-600 hover:underline">View Current CV</a>}

          {error && (
            <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 text-sm border border-red-200 dark:border-red-900">
              {error}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !file}
              className="inline-flex items-center px-6 py-3 rounded-xl text-white font-medium bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/25"
            >
              {loading ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Analyse par l&apos;IA en cours...
                </>
              ) : (
                'Analyse and Recommand Formation'
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-8 animate-fade-in">
          {/* Section 1: Points Forts & Compétences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
                Points Forts
              </h3>
              <ul className="space-y-2">
                {result.pointsForts?.map((point, index) => (
                  <li key={index} className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                    <svg className="w-5 h-5 text-green-500 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    {point}
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
                <span className="w-3 h-3 bg-indigo-500 rounded-full mr-2"></span>
                Compétences Clés
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.competences?.map((comp, index) => (
                  <span key={index} className="px-3 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium border border-indigo-100 dark:border-indigo-900">
                    {comp}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Axes d'Amélioration */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center">
              <span className="w-3 h-3 bg-amber-500 rounded-full mr-2"></span>
              Axes d&apos;Amélioration
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {result.pointsAmeliorer?.map((point, index) => (
                <div key={index} className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 text-sm text-amber-900 dark:text-amber-200 flex items-start">
                  <svg className="w-5 h-5 text-amber-500 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>{point}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Section 3: Formations Recommandées */}
          <div className="space-y-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
              <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              Formations Recommandées
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {result.recommendedCourses?.map((course, index) => (
                <div key={index} className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 flex flex-col justify-between hover:border-indigo-500/50 transition-all">
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <h4 className="font-bold text-gray-900 dark:text-white text-lg">{course.title}</h4>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDifficultyColor(course.difficulty)}`}>
                        {course.difficulty}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">{course.reason}</p>
                  </div>
                  <div className="pt-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg">
                      Focus: {course.focusArea}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
