'use client';

import CourseRecommender from '@/components/CourseRecommender';
import AppShell from '@/components/shell/AppShell';
import { PageHeader } from '@/components/ui/kit';
import { useRoleGuard } from '@/lib/use-role-guard';

export default function StudentRecommendationsPage() {
  useRoleGuard('STUDENT');
  return (
    <AppShell role="STUDENT" active="recommendations">
      <PageHeader eyebrow="Carrière" title="Recommandations IA" subtitle="Analysez votre profil et découvrez des parcours d’apprentissage sur mesure, propulsés par Gemini." />
      <CourseRecommender />
    </AppShell>
  );
}
