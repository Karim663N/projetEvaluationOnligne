'use client';

import { useEffect, useState } from 'react';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const ADMIN_NAV = [
  { href: '/admin/home', icon: '👥', label: 'User Management', color: 'purple' as const },
  { href: '/admin/classes', icon: '🏛️', label: 'Class Management', color: 'sky' as const },
  { href: '/admin/certificates', icon: '📜', label: 'Certificate Templates', color: 'amber' as const },
  { href: '/admin/badges', icon: '🏆', label: 'Achievement Badges', color: 'emerald' as const },
  { href: '/admin/system', icon: '⚙️', label: 'System Settings & Logs', color: 'orange' as const },
];

interface CertificateTemplateItem {
  id: string;
  title: string;
  description?: string | null;
  issuerName?: string | null;
}

export default function AdminCertificatesPage() {
  const t = useT();
  const [templates, setTemplates] = useState<CertificateTemplateItem[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [issuerName, setIssuerName] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    try {
      const res = await fetch('/api/admin/certificate-templates');
      const data = await res.json();
      if (res.ok) setTemplates(data.templates || []);
    } catch {}
  };

  useEffect(() => {
    refresh();
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const res = await fetch('/api/admin/certificate-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, issuerName }),
      });
      const data = await res.json();
      setNotice(res.ok ? t('Certificate template added successfully.') : data.error || t('Could not create certificate template'));
      if (res.ok) {
        setTitle('');
        setDescription('');
        setIssuerName('');
        refresh();
      }
    } catch {
      setNotice(t('Could not create certificate template'));
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <WorkspaceSidebar title="Admin HQ" accent="purple" items={ADMIN_NAV} />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-7">
        <header>
          <h1 className="mt-2 text-4xl font-bold">{t('Certificate Templates')}</h1>
          <p className="text-slate-500">{t('Create and manage official certificate templates that teachers can issue to students.')}</p>
        </header>

        <form onSubmit={create} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-slate-900">{t('Add Certificate Template')}</h2>
          {notice && <p role="status" className="rounded-lg bg-purple-50 p-3 text-sm text-purple-800"><DynamicText text={notice} /></p>}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold mb-1">{t('Certificate Title')}</label>
              <input
                required
                minLength={3}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={t('e.g., Certificate of Excellence')}
                className="w-full rounded-xl border px-4 py-2.5 bg-white text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">{t('Default Issuer Name')}</label>
              <input
                value={issuerName}
                onChange={e => setIssuerName(e.target.value)}
                placeholder={t('e.g., Academic Board')}
                className="w-full rounded-xl border px-4 py-2.5 bg-white text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">{t('Description / Recognition Text')}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder={t('in recognition of outstanding academic performance...')}
              className="w-full rounded-xl border px-4 py-2.5 bg-white text-sm"
            />
          </div>
          <div className="flex justify-end">
            <button className="rounded-xl bg-purple-600 px-6 py-2.5 font-bold text-white shadow-md hover:bg-purple-700 transition-all">
              {t('Add Certificate Template')}
            </button>
          </div>
        </form>

        <div className="grid gap-4 sm:grid-cols-2">
          {templates.map(tmpl => (
            <article key={tmpl.id} className="rounded-2xl border bg-white p-6 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-start gap-3">
                  <span className="text-3xl">📜</span>
                  <div>
                    <h2 className="font-bold text-lg"><DynamicText text={tmpl.title} /></h2>
                    <p className="mt-1 text-sm text-slate-500">{tmpl.description ? <DynamicText text={tmpl.description} /> : t('No description')}</p>
                  </div>
                </div>
              </div>
              {tmpl.issuerName && (
                <div className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-purple-700">
                  {t('Issuer')}: <DynamicText text={tmpl.issuerName} />
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
      </main>
    </div>
  );
}
