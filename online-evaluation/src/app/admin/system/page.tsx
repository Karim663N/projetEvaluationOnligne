'use client';

import { useEffect, useState } from 'react';
import type { AuditLogView } from '@/lib/types';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const ADMIN_NAV = [
  { href: '/admin/home', icon: '👥', label: 'User Management', color: 'purple' as const },
  { href: '/admin/classes', icon: '🏛️', label: 'Class Management', color: 'sky' as const },
  { href: '/admin/certificates', icon: '📜', label: 'Certificate Templates', color: 'amber' as const },
  { href: '/admin/badges', icon: '🏆', label: 'Achievement Badges', color: 'emerald' as const },
  { href: '/admin/system', icon: '⚙️', label: 'System Settings & Logs', color: 'orange' as const },
];

export default function AdminSystemPage() {
  const t = useT();
  const [settings, setSettings] = useState({ platformName: 'Online Evaluation', supportEmail: '', maintenanceMode: 'false' });
  const [logs, setLogs] = useState<AuditLogView[]>([]); const [notice, setNotice] = useState('');
  const refresh = async () => { const [s, l] = await Promise.all([fetch('/api/admin/settings'), fetch('/api/admin/logs')]); const sd = await s.json(); const ld = await l.json(); if (s.ok) setSettings(sd.settings); if (l.ok) setLogs(ld.logs); };
  useEffect(() => { refresh(); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, maintenanceMode: settings.maintenanceMode === 'true' }) }); const data = await res.json(); setNotice(res.ok ? 'Platform settings saved.' : data.error || 'Could not save settings'); if (res.ok) refresh(); };
  return <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900"><WorkspaceSidebar title="Admin HQ" accent="purple" items={ADMIN_NAV} /><main className="flex-1 p-6 md:p-10 overflow-y-auto"><div className="mx-auto max-w-6xl space-y-8"><header><h1 className="mt-2 text-4xl font-bold">{t('Platform settings & activity')}</h1><p className="text-slate-500">{t('Configure platform contact details and review recent administrative actions.')}</p></header>
    <form onSubmit={save} className="space-y-4 rounded-2xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold">{t('General settings')}</h2><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">{t('Platform name')}<input value={settings.platformName} onChange={e => setSettings({ ...settings, platformName: e.target.value })} required minLength={2} maxLength={80} className="mt-1 block w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold">{t('Support email')}<input type="email" value={settings.supportEmail} onChange={e => setSettings({ ...settings, supportEmail: e.target.value })} className="mt-1 block w-full rounded-lg border px-3 py-2"/></label></div><div><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={settings.maintenanceMode === 'true'} onChange={e => setSettings({ ...settings, maintenanceMode: String(e.target.checked) })}/>{t('Maintenance mode')}</label><p className="mt-1 text-xs text-slate-500">{t('Blocks new sign-ins and registration. Students with an active exam can finish and submit it.')}</p></div><div className="flex items-center gap-4"><button className="rounded-lg bg-violet-700 px-5 py-2 font-semibold text-white">{t('Save settings')}</button><span className="text-sm text-violet-700"><DynamicText text={notice} /></span></div></form>
    <section className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-bold">{t('Recent activity')}</h2><p className="text-sm text-slate-500">{t('Latest 100 administrative and classroom actions.')}</p></div><button onClick={refresh} className="rounded-lg border px-3 py-2 text-sm">{t('Refresh')}</button></div><div className="mt-4 divide-y">{logs.map(log => <div key={log.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold"><DynamicText text={log.action.replaceAll('_', ' ')} /></p><p className="text-sm text-slate-500">{log.actor?.name || t('Former user')}{log.target ? ` · ${log.target}` : ''}{log.details ? ` · ` : ''}{log.details ? <DynamicText text={log.details} /> : null}</p></div><time className="text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</time></div>)}{logs.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{t('No activity recorded yet.')}</p>}</div></section>
  </div></main></div>;
}
