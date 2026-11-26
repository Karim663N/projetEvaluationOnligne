'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, PageHeader } from '@/components/ui/kit';
import { useT } from '@/lib/dynamic-text';
import { useLang } from '@/lib/use-lang';

type CertificateItem = { id: string; code: string; examTitle: string; description: string | null; issuerName: string | null; issuedAt: string };

export default function StudentCertificatesPage() {
  useRoleGuard('STUDENT');
  const t = useT();
  const [lang] = useLang();
  const locale = lang === 'ar' ? 'ar' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/student/certificates', { cache: 'no-store' })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => { if (response.ok) setCertificates(data.certificates || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell role="STUDENT" active="certificates">
      <PageHeader eyebrow={t('Vos réussites')} title={t('Certificats')} subtitle={t('Consultez vos distinctions et téléchargez une copie PDF prête à imprimer.')} />
      {loading ? <div className="grid gap-4 md:grid-cols-2"><div className="eg-card h-48 animate-pulse bg-slate-100/60" /><div className="eg-card h-48 animate-pulse bg-slate-100/60" /></div>
        : certificates.length === 0 ? <EmptyState icon="award" title={t('Aucun certificat pour l’instant')} text={t('Les certificats délivrés par vos enseignants apparaîtront ici.')} action={<Link href="/student/home" className="eg-btn eg-btn-primary">{t('Retour au tableau de bord')}</Link>} />
        : (
          <div className="grid gap-4 md:grid-cols-2">
            {certificates.map((c) => (
              <article key={c.id} className="eg-card eg-card-hover relative overflow-hidden p-6">
                <div className="pointer-events-none absolute -end-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-brand-200/60 to-cyan-200/40 blur-2xl" />
                <div className="relative flex items-start gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-cyan-500 text-white shadow-lg shadow-brand-500/30"><Icon name="award" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="eg-eyebrow">{t('Certificat')}</p>
                    <h2 className="mt-1 font-semibold text-slate-900">{c.examTitle}</h2>
                    <p className="mt-1 text-sm text-slate-500">{t('Délivré le')} {new Date(c.issuedAt).toLocaleDateString(locale)}{c.issuerName ? ` · ${t('par')} ${c.issuerName}` : ''}</p>
                  </div>
                </div>
                {c.description && <p className="relative mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{c.description}</p>}
                <p className="relative mt-3 break-all font-mono text-[11px] text-slate-400">ID {c.code}</p>
                <div className="relative mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                  <Link href={`/student/certificates/${c.id}`} className="eg-btn eg-btn-secondary eg-btn-sm"><Icon name="eye" className="h-3.5 w-3.5" />{t('Voir')}</Link>
                  <a href={`/api/student/certificates/${c.id}/download`} className="eg-btn eg-btn-primary eg-btn-sm"><Icon name="download" className="h-3.5 w-3.5" />{t('Télécharger le PDF')}</a>
                </div>
              </article>
            ))}
          </div>
        )}
    </AppShell>
  );
}
