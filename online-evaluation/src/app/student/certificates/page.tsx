'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRoleGuard } from '@/lib/use-role-guard';

type CertificateItem = { id: string; code: string; examTitle: string; description: string | null; issuerName: string | null; issuedAt: string };

export default function StudentCertificatesPage() {
  useRoleGuard('STUDENT');
  const router = useRouter();
  const [certificates, setCertificates] = useState<CertificateItem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('/api/student/certificates', { cache: 'no-store' })
      .then(async response => ({ response, data: await response.json() }))
      .then(({ response, data }) => { if (response.ok) setCertificates(data.certificates || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  const logout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/'); };

  return <main className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-20 border-b border-teal-100 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
        <Link href="/student/home" className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-700 text-xl text-white">✓</span><span className="text-xl font-black tracking-tight">ExamGuard <span className="text-teal-700">AI</span></span></Link>
        <nav aria-label="Student navigation" className="flex items-center gap-2 text-sm font-semibold"><span className="rounded-lg bg-teal-50 px-3 py-2 text-teal-800">Certificates</span><Link href="/student/home" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Dashboard</Link><Link href="/student/results" className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Results</Link><button onClick={logout} className="rounded-lg px-3 py-2 text-rose-700 hover:bg-rose-50">Log out</button></nav>
      </div>
    </header>
    <section className="mx-auto max-w-6xl px-5 py-10 md:px-8">
      <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.22em] text-teal-700">Your achievements</p><h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Certificates</h1><p className="mt-2 max-w-2xl text-slate-600">View your awards and download a print-ready PDF copy whenever you need one.</p></div>
      {loading ? <div className="rounded-2xl border bg-white p-10 text-center text-slate-500">Loading your certificates…</div> : certificates.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-700">◇</div><h2 className="mt-4 text-xl font-bold">No certificates yet</h2><p className="mt-2 text-sm text-slate-500">Certificates awarded by your teachers will appear here.</p><Link href="/student/home" className="mt-5 inline-flex rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Back to dashboard</Link></div> : <div className="grid gap-4 md:grid-cols-2">{certificates.map(certificate => <article key={certificate.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-4"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-teal-50 text-2xl text-teal-700">✓</div><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wider text-teal-700">Certificate of achievement</p><h2 className="mt-1 text-lg font-bold">{certificate.examTitle}</h2><p className="mt-1 text-sm text-slate-500">Issued {new Date(certificate.issuedAt).toLocaleDateString()}</p>{certificate.issuerName && <p className="mt-1 text-sm text-slate-500">By {certificate.issuerName}</p>}</div></div>{certificate.description && <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-600">{certificate.description}</p>}<p className="mt-3 break-all font-mono text-xs text-slate-400">ID {certificate.code}</p><div className="mt-5 flex flex-wrap gap-2 border-t pt-4"><Link href={`/student/certificates/${certificate.id}`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">View certificate</Link><a href={`/api/student/certificates/${certificate.id}/download`} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-800">Download PDF</a></div></article>)}</div>}
    </section>
  </main>;
}
