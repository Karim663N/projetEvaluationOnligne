'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { BadgeView } from '@/lib/types';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const ADMIN_NAV = [
  { href: '/admin/home', icon: '👥', label: 'User Management', color: 'purple' as const },
  { href: '/admin/classes', icon: '🏛️', label: 'Class Management', color: 'sky' as const },
  { href: '/admin/certificates', icon: '📜', label: 'Certificate Templates', color: 'amber' as const },
  { href: '/admin/badges', icon: '🏆', label: 'Achievement Badges', color: 'emerald' as const },
  { href: '/admin/system', icon: '⚙️', label: 'System Settings & Logs', color: 'orange' as const },
];

export default function BadgesPage() {
  const t = useT();
  const [badges, setBadges] = useState<BadgeView[]>([]); const [name, setName] = useState(''); const [description, setDescription] = useState(''); const [notice, setNotice] = useState('');
  const refresh = async () => { const res = await fetch('/api/admin/badges'); const data = await res.json(); if (res.ok) setBadges(data.badges); };
  useEffect(() => { refresh(); }, []);
  const create = async (event: React.FormEvent) => { event.preventDefault(); const res = await fetch('/api/admin/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) }); const data = await res.json(); setNotice(res.ok ? 'Badge added to the grading catalog.' : data.error || 'Could not create badge'); if (res.ok) { setName(''); setDescription(''); refresh(); } };
  return <div className="flex h-screen overflow-hidden bg-slate-50"><WorkspaceSidebar title="Admin HQ" accent="purple" items={ADMIN_NAV} /><main className="flex-1 p-6 md:p-10 overflow-y-auto"><div className="mx-auto max-w-5xl space-y-7"><header><h1 className="mt-2 text-4xl font-bold">{t('Achievement badges')}</h1><p className="text-slate-500">{t('Create awards teachers can issue from the grading center.')}</p></header><form onSubmit={create} className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_2fr_auto]"><input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder={t('Badge name')} className="rounded-lg border px-3 py-2"/><input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('Description')} className="rounded-lg border px-3 py-2"/><button className="rounded-lg bg-violet-700 px-5 py-2 font-semibold text-white">{t('Add badge')}</button>{notice && <p className="md:col-span-3 text-sm text-violet-700"><DynamicText text={notice} /></p>}</form><div className="grid gap-4 sm:grid-cols-2">{badges.map(b => <article key={b.id} className="rounded-xl border bg-white p-5"><div className="flex gap-3"><span className="text-3xl">🏅</span><div><h2 className="font-bold"><DynamicText text={b.name} /></h2><p className="text-sm text-slate-500">{b.description ? <DynamicText text={b.description} /> : t('No description')}</p><p className="mt-2 text-xs text-violet-700">{t('Awarded to')} {b._count?.users ?? 0} {t('students')}</p></div></div></article>)}</div></div></main></div>;
}
