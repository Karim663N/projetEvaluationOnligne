'use client';

import { useState, useEffect } from 'react';
import { useRoleGuard } from '@/lib/use-role-guard';
import type { AdminUser, PlatformAnalytics } from '@/lib/types';
import { useLang, useT } from '@/lib';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

export default function AdminHome() {
  useRoleGuard('ADMIN');
  const lang = useLang();
  const t = useT();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);

  useEffect(() => {
    fetchUsers();
    fetch('/api/admin/analytics').then(r => r.json()).then(data => setAnalytics(data)).catch(() => {});
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
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role }),
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleStatusChange = async (userId: string, isActive: boolean) => {
    const res = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, isActive }) });
    if (res.ok) fetchUsers();
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      const res = await fetch(`/api/admin/users?userId=${userId}`, {
        method: 'DELETE',
      });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-slate-50 text-slate-900 ${lang === 'ar' ? 'rtl' : 'ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <WorkspaceSidebar
        title="Admin HQ"
        accent="purple"
        items={[
          { href: '/admin/home', icon: '👥', label: 'User Management', color: 'purple' },
          { href: '/admin/classes', icon: '🏛️', label: 'Class Management', color: 'sky' },
          { href: '/admin/certificates', icon: '📜', label: 'Certificate Templates', color: 'amber' },
          { href: '/admin/badges', icon: '🏆', label: 'Achievement Badges', color: 'emerald' },
          { href: '/admin/system', icon: '⚙️', label: 'System Settings & Logs', color: 'orange' },
        ]}
      />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-3xl font-black text-slate-900">{t('Dashboard Overview')}</h2>
            <p className="text-slate-500 font-medium text-sm">{t('Monitor platform activity and manage users.')}</p>
          </div>
        </header>

        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">{t('Students')}</div>
              <div className="text-4xl font-black text-slate-900">{analytics.students}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">{t('Teachers')}</div>
              <div className="text-4xl font-black text-slate-900">{analytics.teachers}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">{t('Published Exams')}</div>
              <div className="text-4xl font-black text-slate-900">{analytics.publishedExams}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">{t('Submissions')}</div>
              <div className="text-4xl font-black text-slate-900">{analytics.submissions}</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-xl font-bold text-slate-900">{t('User Directory')}</h3>
            <div className="flex gap-3 w-full sm:w-auto">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Search by name or email...')}
                className="flex-1 sm:w-80 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
              />
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
              >
                <option value="ALL">{t('All Roles')}</option>
                <option value="ADMIN">{t('Admins')}</option>
                <option value="TEACHER">{t('Teachers')}</option>
                <option value="STUDENT">{t('Students')}</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">{t('Loading users...')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">{t('User')}</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">{t('Email')}</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">{t('Role')}</th>
                    <th className="px-6 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-wider">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {users.filter(u => (roleFilter === 'ALL' || u.role === roleFilter) && `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())).map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-400">{t('Joined:')} {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm bg-white font-bold text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="STUDENT">{t('STUDENT')}</option>
                          <option value="TEACHER">{t('TEACHER')}</option>
                          <option value="ADMIN">{t('ADMIN')}</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleStatusChange(u.id, !u.isActive)}
                          className={`mr-4 font-bold ${u.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                        >
                          {u.isActive ? t('Block Account') : t('Activate Account')}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold"
                        >
                          {t('Delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
