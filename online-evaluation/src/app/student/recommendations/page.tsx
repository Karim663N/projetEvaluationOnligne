'use client';

import CourseRecommender from '@/components/CourseRecommender';
import { useT } from '@/lib';

export default function StudentRecommendationsPage() {
  const t = useT();
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto mb-8">
        <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white">{t('Portail Étudiant - Recommandations de Formations IA')}</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {t("Analysez votre profil et découvrez des parcours d'apprentissage sur-mesure propulsés par Gemini.")}
        </p>
      </div>
      <CourseRecommender />
    </div>
  );
}
