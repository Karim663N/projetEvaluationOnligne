'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CertificateView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';

export default function CertificatePage() {
  useRoleGuard('STUDENT');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [certificate, setCertificate] = useState<CertificateView | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch(`/api/student/certificates/${id}`).then(async r => { const data = await r.json(); if (r.ok) setCertificate(data.certificate); else setError(data.error || 'Could not load certificate'); }).catch(() => setError('Could not load certificate')); }, [id]);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/'); };
  if (error) return <main className="min-h-screen grid place-items-center bg-slate-50 p-6"><div className="rounded-xl bg-white p-8 text-center"><p>{error}</p><Link href="/student/certificates" className="mt-4 inline-block text-teal-700">Return to certificates</Link></div></main>;
  if (!certificate) return <main className="min-h-screen grid place-items-center bg-slate-50 text-slate-500">Loading certificate…</main>;
  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-teal-100 bg-white/95 shadow-sm backdrop-blur print:hidden"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8"><Link href="/student/certificates" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-xl text-white">✓</span><span className="text-xl font-black tracking-tight">ExamGuard <span className="text-teal-700">AI</span></span></Link><nav className="flex items-center gap-2 text-sm font-semibold"><Link href="/student/certificates" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">All certificates</Link><Link href="/student/home" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Dashboard</Link><a href={`/api/student/certificates/${certificate.id}/download`} className="rounded-lg bg-teal-700 px-4 py-2 text-white hover:bg-teal-800">Download PDF</a><button onClick={logout} className="rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50">Log out</button></nav></div></header>
    <section className="mx-auto max-w-5xl px-4 py-8 md:px-8 md:py-12 print:max-w-none print:p-0"><article className="certificate-sheet relative flex min-h-[680px] flex-col items-center overflow-hidden border-[10px] border-double border-teal-700 bg-[#fbfcfd] px-6 py-14 text-center shadow-xl md:px-16 print:min-h-[190mm] print:shadow-none"><div className="absolute inset-[10px] border border-slate-300 pointer-events-none"/><div className="relative flex items-center gap-1 text-2xl font-black tracking-tight">ExamGuard <span className="text-teal-700">AI</span></div><p className="relative mt-10 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">Certificate of Academic Integrity</p><h1 className="relative mt-9 max-w-full break-words text-3xl font-extrabold tracking-tight text-slate-900 md:text-5xl">{certificate.user.name}</h1><p className="relative mt-4 text-base text-slate-600">has completed</p><h2 className="relative mt-1 max-w-3xl break-words text-xl font-bold text-slate-800 md:text-2xl">{certificate.examTitle}</h2><p className="relative mt-4 max-w-2xl whitespace-pre-line text-base leading-7 text-slate-600">{certificate.description || 'in recognition of academic achievement and commitment to honest work.'}</p><div className="relative my-8 grid h-16 w-16 place-items-center rounded-full border-[3px] border-teal-700 text-3xl font-bold text-teal-700">✓</div><div className="relative mt-auto grid w-full max-w-3xl grid-cols-1 items-end gap-6 text-left text-sm text-slate-500 md:grid-cols-3"><div className="border-t border-slate-500 pt-2"><p className="font-medium text-slate-700">{certificate.issuerName || 'Teacher'}</p><p>Issuing teacher</p></div><div className="text-center"><p className="font-medium text-slate-700">{new Date(certificate.issuedAt).toLocaleDateString()}</p><p>Issue date</p><p className="mt-2 break-all font-mono text-xs">Verification ID: {certificate.code}</p></div><div className="flex justify-end"><div className="grid h-[68px] w-[68px] place-items-center border border-dashed border-slate-400 text-2xl text-teal-700">✓</div></div></div></article></section>
    <style jsx global>{`@media print { @page { size: landscape; margin: 8mm; } body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
  </main>;
}
