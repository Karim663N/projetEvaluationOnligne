'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { CertificateView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, LogoMark } from '@/components/ui/kit';
import { useT } from '@/lib/dynamic-text';

export default function CertificatePage() {
  useRoleGuard('STUDENT');
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const [certificate, setCertificate] = useState<CertificateView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    fetch(`/api/student/certificates/${id}`).then(async (r) => { const data = await r.json(); if (r.ok) setCertificate(data.certificate); else setError(data.error || 'Certificat introuvable'); })
      .catch(() => setError(t('Certificat introuvable')));
  }, [id]);

  return (
    <AppShell role="STUDENT" active="certificates"
      actions={certificate && <div className="flex gap-2 print:hidden">
        <button onClick={() => window.print()} className="eg-btn eg-btn-secondary eg-btn-sm hidden sm:inline-flex">{t('Imprimer')}</button>
        <a href={`/api/student/certificates/${certificate.id}/download`} className="eg-btn eg-btn-primary eg-btn-sm"><Icon name="download" className="h-3.5 w-3.5" />PDF</a>
      </div>}>
      <Link href="/student/certificates" className="eg-btn eg-btn-ghost eg-btn-sm mb-4 print:hidden"><Icon name="chevronLeft" className="h-4 w-4" />{t('Tous les certificats')}</Link>
      {error ? <EmptyState icon="alert" title={t(error)} action={<Link href="/student/certificates" className="eg-btn eg-btn-primary">{t('Retour aux certificats')}</Link>} />
        : !certificate ? <div className="eg-card h-[600px] animate-pulse bg-slate-100/60" />
        : (
          <article className="certificate-sheet relative mx-auto flex min-h-[680px] max-w-5xl flex-col items-center overflow-hidden border-[10px] border-double border-brand-700 bg-[#fbfcfd] px-6 py-14 text-center shadow-xl md:px-16 print:min-h-[190mm] print:shadow-none">
            <div className="pointer-events-none absolute inset-[10px] border border-slate-300" />
            <div className="pointer-events-none absolute -end-24 -top-24 h-72 w-72 rounded-full bg-brand-100/60 blur-3xl print:hidden" />
            <div className="relative flex items-center gap-2 text-2xl font-bold tracking-tight"><LogoMark className="h-8 w-8" />ExamGuard <span className="text-brand-600">AI</span></div>
            <p className="relative mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">{t('Certificate of Academic Integrity')}</p>
            <h1 className="relative mt-9 max-w-full break-words text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{certificate.user.name}</h1>
            <p className="relative mt-4 text-base text-slate-600">{t('has completed')}</p>
            <h2 className="relative mt-1 max-w-3xl break-words text-xl font-bold text-slate-800 md:text-2xl">{certificate.examTitle}</h2>
            <p className="relative mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-slate-600">{certificate.description || t('in recognition of academic achievement and commitment to honest work.')}</p>
            <div className="relative my-8 grid h-16 w-16 place-items-center rounded-full border-[3px] border-brand-700 text-brand-700"><Icon name="check" className="h-8 w-8" strokeWidth={2.4} /></div>
            <div className="relative mt-auto grid w-full max-w-3xl grid-cols-1 items-end gap-6 text-left text-sm text-slate-500 md:grid-cols-3">
              <div className="border-t border-slate-500 pt-2"><p className="font-medium text-slate-700">{certificate.issuerName || 'Teacher'}</p><p>{t('Issuing teacher')}</p></div>
              <div className="text-center"><p className="font-medium text-slate-700">{new Date(certificate.issuedAt).toLocaleDateString()}</p><p>{t('Issue date')}</p><p className="mt-2 break-all font-mono text-xs">{t('Verification ID:')} {certificate.code}</p></div>
              <div className="flex justify-end"><div className="grid h-[68px] w-[68px] place-items-center border border-dashed border-slate-400 text-brand-700"><Icon name="shield" className="h-8 w-8" /></div></div>
            </div>
          </article>
        )}
      <style jsx global>{`@media print { @page { size: landscape; margin: 8mm; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
    </AppShell>
  );
}
