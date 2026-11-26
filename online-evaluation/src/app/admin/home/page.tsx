'use client';

import { useEffect, useState } from 'react';
import { useRoleGuard } from '@/lib/use-role-guard';
import type { AdminUser, PlatformAnalytics } from '@/lib/types';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/kit';
import { useT } from '@/lib/dynamic-text';
import { useLang } from '@/lib/use-lang';

const ROLE_BADGE: Record<string, string> = { ADMIN: 'eg-badge-red', TEACHER: 'eg-badge-brand', STUDENT: 'eg-badge-green' };
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrateur', TEACHER: 'Enseignant', STUDENT: 'Étudiant' };

export default function AdminHome() {
  useRoleGuard('ADMIN');
  const t = useT();
  const [lang] = useLang();
  const locale = lang === 'ar' ? 'ar' : lang === 'en' ? 'en-GB' : 'fr-FR';
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);

  useEffect(() => {
    fetchUsers();
    fetch('/api/admin/analytics').then((r) => r.json()).then((data) => setAnalytics(data)).catch(() => {});
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (res.ok) setUsers(data.users || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, role }) });
    if (res.ok) fetchUsers();
  };
  const handleStatusChange = async (userId: string, isActive: boolean) => {
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, isActive }) });
    if (res.ok) fetchUsers();
  };
  const handleDeleteUser = async (userId: string) => {
    if (!confirm(t('Supprimer définitivement cet utilisateur ?'))) return;
    const res = await fetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  const shown = users.filter((u) => (roleFilter === 'ALL' || u.role === roleFilter) && `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  const byRole = (r: string) => users.filter((u) => u.role === r).length;

  return (
    <AppShell role="ADMIN" active="users">
      <PageHeader eyebrow={t('Plateforme')} title={t('Vue d’ensemble')} subtitle={t('Suivez l’activité de la plateforme et gérez les comptes.')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Étudiants')} value={analytics?.students ?? '—'} icon="cap" tone="green" />
        <StatCard label={t('Enseignants')} value={analytics?.teachers ?? '—'} icon="pen" tone="brand" />
        <StatCard label={t('Examens publiés')} value={analytics?.publishedExams ?? '—'} icon="exam" tone="violet" />
        <StatCard label={t('Copies remises')} value={analytics?.submissions ?? '—'} icon="check" tone="amber" />
      </div>

      <div className="eg-card mt-7 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><p className="eg-h2">{t('Annuaire des utilisateurs')}</p><p className="text-sm text-slate-500">{users.length} {t(users.length > 1 ? 'comptes' : 'compte')}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eg-segmented" role="group" aria-label={t('Filtrer par rôle')}>
              {([['ALL', 'Tous'], ['STUDENT', 'Étudiants'], ['TEACHER', 'Enseignants'], ['ADMIN', 'Admins']] as const).map(([k, l]) => (
                <button key={k} onClick={() => setRoleFilter(k)} aria-pressed={roleFilter === k}>{t(l)} <span className="ms-1 text-xs text-slate-400">{k === 'ALL' ? users.length : byRole(k)}</span></button>
              ))}
            </div>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Nom ou e-mail…')} className="eg-input w-60 ps-9" aria-label={t('Rechercher un utilisateur')} />
            </div>
          </div>
        </div>
        {loading ? <div className="h-48 animate-pulse bg-slate-50" /> : shown.length === 0 ? <div className="p-5"><EmptyState icon="users" title={t('Aucun utilisateur')} text={t('Modifiez la recherche ou le filtre.')} /></div> : (
          <div className="overflow-x-auto">
            <table className="eg-table">
              <thead><tr><th>{t('Utilisateur')}</th><th>{t('Rôle')}</th><th>{t('Statut')}</th><th>{t('Inscrit le')}</th><th className="text-end">{t('Actions')}</th></tr></thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3"><Avatar name={u.name} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{u.name}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div></div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`eg-badge ${ROLE_BADGE[u.role] ?? 'eg-badge-slate'}`}>{t(ROLE_LABEL[u.role] ?? u.role)}</span>
                        <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)} className="eg-input w-auto py-1 text-xs" aria-label={`${t('Rôle de')} ${u.name}`}>
                          <option value="STUDENT">{t('Étudiant')}</option><option value="TEACHER">{t('Enseignant')}</option><option value="ADMIN">{t('Admin')}</option>
                        </select>
                      </div>
                    </td>
                    <td><span className={`eg-badge ${u.isActive ? 'eg-badge-green' : 'eg-badge-slate'}`}><span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />{u.isActive ? t('Actif') : t('Bloqué')}</span></td>
                    <td className="whitespace-nowrap text-slate-500">{u.createdAt ? new Date(u.createdAt).toLocaleDateString(locale) : '—'}</td>
                    <td className="whitespace-nowrap text-end">
                      <button onClick={() => handleStatusChange(u.id, !u.isActive)} className={`eg-btn eg-btn-sm ${u.isActive ? 'eg-btn-ghost text-amber-700' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{u.isActive ? t('Bloquer') : t('Activer')}</button>
                      <button onClick={() => handleDeleteUser(u.id)} className="ms-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`${t('Supprimer')} ${u.name}`}><Icon name="trash" className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
