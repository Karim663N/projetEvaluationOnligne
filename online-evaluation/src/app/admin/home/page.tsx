'use client';

import { useEffect, useState } from 'react';
import { useRoleGuard } from '@/lib/use-role-guard';
import type { AdminUser, PlatformAnalytics } from '@/lib/types';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, PageHeader, StatCard } from '@/components/ui/kit';

const ROLE_BADGE: Record<string, string> = { ADMIN: 'eg-badge-red', TEACHER: 'eg-badge-brand', STUDENT: 'eg-badge-green' };
const ROLE_LABEL: Record<string, string> = { ADMIN: 'Administrateur', TEACHER: 'Enseignant', STUDENT: 'Étudiant' };

export default function AdminHome() {
  useRoleGuard('ADMIN');
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
    if (!confirm('Supprimer définitivement cet utilisateur ?')) return;
    const res = await fetch(`/api/admin/users?userId=${userId}`, { method: 'DELETE' });
    if (res.ok) fetchUsers();
  };

  const shown = users.filter((u) => (roleFilter === 'ALL' || u.role === roleFilter) && `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()));
  const byRole = (r: string) => users.filter((u) => u.role === r).length;

  return (
    <AppShell role="ADMIN" active="users">
      <PageHeader eyebrow="Plateforme" title="Vue d’ensemble" subtitle="Suivez l’activité de la plateforme et gérez les comptes." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Étudiants" value={analytics?.students ?? '—'} icon="cap" tone="green" />
        <StatCard label="Enseignants" value={analytics?.teachers ?? '—'} icon="pen" tone="brand" />
        <StatCard label="Examens publiés" value={analytics?.publishedExams ?? '—'} icon="exam" tone="violet" />
        <StatCard label="Copies remises" value={analytics?.submissions ?? '—'} icon="check" tone="amber" />
      </div>

      <div className="eg-card mt-7 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><p className="eg-h2">Annuaire des utilisateurs</p><p className="text-sm text-slate-500">{users.length} compte{users.length > 1 ? 's' : ''}</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="eg-segmented" role="group" aria-label="Filtrer par rôle">
              {([['ALL', 'Tous', users.length], ['STUDENT', 'Étudiants', byRole('STUDENT')], ['TEACHER', 'Enseignants', byRole('TEACHER')], ['ADMIN', 'Admins', byRole('ADMIN')]] as const).map(([k, l, n]) => (
                <button key={k} onClick={() => setRoleFilter(k)} aria-pressed={roleFilter === k}>{l} <span className="ms-1 text-xs text-slate-400">{n}</span></button>
              ))}
            </div>
            <div className="relative">
              <Icon name="search" className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou e-mail…" className="eg-input w-60 ps-9" aria-label="Rechercher un utilisateur" />
            </div>
          </div>
        </div>
        {loading ? <div className="h-48 animate-pulse bg-slate-50" /> : shown.length === 0 ? <div className="p-5"><EmptyState icon="users" title="Aucun utilisateur" text="Modifiez la recherche ou le filtre." /></div> : (
          <div className="overflow-x-auto">
            <table className="eg-table">
              <thead><tr><th>Utilisateur</th><th>Rôle</th><th>Statut</th><th>Inscrit le</th><th className="text-end">Actions</th></tr></thead>
              <tbody>
                {shown.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-3"><Avatar name={u.name} /><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{u.name}</p><p className="truncate text-xs text-slate-500">{u.email}</p></div></div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`eg-badge ${ROLE_BADGE[u.role] ?? 'eg-badge-slate'}`}>{ROLE_LABEL[u.role] ?? u.role}</span>
                        <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)} className="eg-input w-auto py-1 text-xs" aria-label={`Rôle de ${u.name}`}>
                          <option value="STUDENT">Étudiant</option><option value="TEACHER">Enseignant</option><option value="ADMIN">Admin</option>
                        </select>
                      </div>
                    </td>
                    <td><span className={`eg-badge ${u.isActive ? 'eg-badge-green' : 'eg-badge-slate'}`}><span className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />{u.isActive ? 'Actif' : 'Bloqué'}</span></td>
                    <td className="whitespace-nowrap text-slate-500">{u.createdAt ? new Date(u.createdAt).toLocaleDateString('fr-FR') : '—'}</td>
                    <td className="whitespace-nowrap text-end">
                      <button onClick={() => handleStatusChange(u.id, !u.isActive)} className={`eg-btn eg-btn-sm ${u.isActive ? 'eg-btn-ghost text-amber-700' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>{u.isActive ? 'Bloquer' : 'Activer'}</button>
                      <button onClick={() => handleDeleteUser(u.id)} className="ms-1 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Supprimer ${u.name}`}><Icon name="trash" className="h-4 w-4" /></button>
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
