'use client';

import { useEffect, useState } from 'react';
import type { AuditLogView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, PageHeader } from '@/components/ui/kit';
import { DynamicText, useT } from '@/lib/dynamic-text';
import { useLang } from '@/lib/use-lang';

export default function AdminSystemPage() {
  useRoleGuard('ADMIN');
  const t = useT();
  const [lang] = useLang();
  const locale = lang === 'ar' ? 'ar' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const [settings, setSettings] = useState({ platformName: 'Online Evaluation', supportEmail: '', maintenanceMode: 'false' });
  const [logs, setLogs] = useState<AuditLogView[]>([]);
  const [notice, setNotice] = useState('');
  const refresh = async () => {
    const [s, l] = await Promise.all([fetch('/api/admin/settings'), fetch('/api/admin/logs')]);
    const sd = await s.json(); const ld = await l.json();
    if (s.ok) setSettings(sd.settings);
    if (l.ok) setLogs(ld.logs);
  };
  useEffect(() => { refresh(); }, []);
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/admin/settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...settings, maintenanceMode: settings.maintenanceMode === 'true' }) });
    const data = await res.json(); setNotice(res.ok ? t('Paramètres enregistrés.') : data.error || t('Enregistrement impossible')); if (res.ok) refresh();
  };
  const maintenance = settings.maintenanceMode === 'true';

  return (
    <AppShell role="ADMIN" active="system">
      <PageHeader eyebrow={t('Système')} title={t('Paramètres & journal')} subtitle={t('Configurez la plateforme et consultez les dernières actions administratives.')} />
      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <form onSubmit={save} className="eg-card h-fit space-y-4 p-6">
          <p className="eg-h2">{t('Paramètres généraux')}</p>
          <label className="block"><span className="eg-label">{t('Nom de la plateforme')}</span><input value={settings.platformName} onChange={(e) => setSettings({ ...settings, platformName: e.target.value })} required minLength={2} maxLength={80} className="eg-input" /></label>
          <label className="block"><span className="eg-label">{t('E-mail du support')}</span><input type="email" value={settings.supportEmail} onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })} className="eg-input" /></label>
          <div className={`flex items-start justify-between gap-4 rounded-xl p-4 ring-1 ${maintenance ? 'bg-amber-50 ring-amber-200' : 'bg-slate-50 ring-slate-200'}`}>
            <div><p className="text-sm font-semibold text-slate-900">{t('Mode maintenance')}</p><p className="mt-0.5 text-xs text-slate-500">{t('Bloque les connexions et inscriptions. Un étudiant en cours d’examen peut terminer et remettre sa copie.')}</p></div>
            <button type="button" role="switch" aria-checked={maintenance} onClick={() => setSettings({ ...settings, maintenanceMode: String(!maintenance) })}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${maintenance ? 'bg-amber-500' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${maintenance ? 'start-[22px]' : 'start-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 pt-4"><button className="eg-btn eg-btn-primary">{t('Enregistrer')}</button>{notice && <span className="text-sm font-medium text-emerald-700"><DynamicText text={notice} /></span>}</div>
        </form>
        <section className="eg-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div><p className="eg-h2">{t('Activité récente')}</p><p className="text-sm text-slate-500">{t('100 dernières actions')}</p></div>
            <button onClick={refresh} className="eg-btn eg-btn-secondary eg-btn-sm"><Icon name="refresh" className="h-3.5 w-3.5" />{t('Actualiser')}</button>
          </div>
          {logs.length === 0 ? <div className="p-5"><EmptyState icon="activity" title={t('Aucune activité enregistrée')} /></div> : (
            <ol className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto">
              {logs.map((log) => (
                <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                  <Avatar name={log.actor?.name || '?'} className="h-8 w-8 text-xs" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold capitalize text-slate-900"><DynamicText text={log.action.replaceAll('_', ' ').toLowerCase()} /></p>
                    <p className="truncate text-xs text-slate-500">{log.actor?.name || t('Ancien utilisateur')}{log.target ? ` · ${log.target}` : ''}{log.details ? ` · ${log.details}` : ''}</p>
                  </div>
                  <time className="shrink-0 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString(locale)}</time>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppShell>
  );
}
