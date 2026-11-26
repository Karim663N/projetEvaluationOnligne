'use client';

import CourseRecommender from '@/components/CourseRecommender';
import AppShell from '@/components/shell/AppShell';
import { PageHeader } from '@/components/ui/kit';
import { useRoleGuard } from '@/lib/use-role-guard';
import { useT } from '@/lib/dynamic-text';

export default function StudentRecommendationsPage() {
  useRoleGuard('STUDENT');
  const t = useT();
  return (
    <AppShell role="STUDENT" active="recommendations">
      <PageHeader eyebrow={t('Carrière')} title={t('Recommandations IA')} subtitle={t('Analysez votre profil et découvrez des parcours d’apprentissage sur mesure, propulsés par Gemini.')} />
      <CourseRecommender />
    </AppShell>
  );
}
