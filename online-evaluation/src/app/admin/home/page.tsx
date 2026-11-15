'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRoleGuard } from '@/lib/use-role-guard';
import type { AdminUser, PlatformAnalytics } from '@/lib/types';
import { translations, Language } from '@/lib/i18n';

export default function AdminHome() {
  useRoleGuard('ADMIN');
  const router = useRouter();
  const [lang, setLang] = useState<Language>('en');
  const t = translations[lang];

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [analytics, setAnalytics] = useState<PlatformAnalytics | null>(null);

  useEffect(() => {
    fetchUsers();
    fetch('/api/admin/analytics').then(r => r.json()).then(data => setAnalytics(data)).catch(() => {});
    const savedLang = localStorage.getItem('app_lang') as Language;
    if (savedLang && translations[savedLang]) setLang(savedLang);
  }, []);

  const changeLanguage = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/');
  };

  return (
    <div className={`flex min-h-screen bg-slate-50 text-slate-900 ${lang === 'ar' ? 'rtl' : 'ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <aside className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col justify-between shadow-sm">
        <div>
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-xl font-black bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">Admin HQ</h1>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-bold">
              <button onClick={() => changeLanguage('en')} className={`px-2 py-1 rounded ${lang === 'en' ? 'bg-white shadow text-purple-600' : 'text-slate-600'}`}>EN</button>
              <button onClick={() => changeLanguage('fr')} className={`px-2 py-1 rounded ${lang === 'fr' ? 'bg-white shadow text-purple-600' : 'text-slate-600'}`}>FR</button>
              <button onClick={() => changeLanguage('ar')} className={`px-2 py-1 rounded ${lang === 'ar' ? 'bg-white shadow text-purple-600' : 'text-slate-600'}`}>AR</button>
            </div>
          </div>
          <nav className="space-y-1.5">
            <button className="w-full text-left rounded-xl px-4 py-3 bg-purple-50 text-purple-600 font-bold shadow-sm">
              👥 User Management
            </button>
            <button onClick={() => router.push('/admin/classes')} className="w-full text-left rounded-xl px-4 py-3 hover:bg-slate-50 text-slate-600 font-semibold transition-all">
              🏛️ Class Management
            </button>
            <button onClick={() => router.push('/admin/badges')} className="w-full text-left rounded-xl px-4 py-3 hover:bg-slate-50 text-slate-600 font-semibold transition-all">
              🏆 Achievement Badges
            </button>
            <button onClick={() => router.push('/admin/system')} className="w-full text-left rounded-xl px-4 py-3 hover:bg-slate-50 text-slate-600 font-semibold transition-all">
              ⚙️ System Settings & Logs
            </button>
          </nav>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 text-rose-600 hover:bg-rose-50 rounded-xl font-bold transition-all">
          🚪 Logout
        </button>
      </aside>

      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900">Dashboard Overview</h2>
            <p className="text-slate-500 font-medium text-sm">Monitor platform activity and manage users.</p>
          </div>
        </header>

        {analytics && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Students</div>
              <div className="text-3xl font-black text-slate-900">{analytics.students}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Teachers</div>
              <div className="text-3xl font-black text-slate-900">{analytics.teachers}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Published Exams</div>
              <div className="text-3xl font-black text-slate-900">{analytics.publishedExams}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div className="text-slate-400 font-bold text-xs uppercase tracking-wider mb-1">Submissions</div>
              <div className="text-3xl font-black text-slate-900">{analytics.submissions}</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h3 className="text-xl font-bold text-slate-900">User Directory</h3>
            <div className="flex gap-3 w-full sm:w-auto">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="flex-1 sm:w-80 rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
              />
              <select
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-600 font-medium"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Admins</option>
                <option value="TEACHER">Teachers</option>
                <option value="STUDENT">Students</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400">Loading users...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-black text-slate-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {users.filter(u => (roleFilter === 'ALL' || u.role === roleFilter) && `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase())).map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{u.name}</div>
                        <div className="text-xs text-slate-400">Joined: {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={u.role}
                          onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          className="rounded-xl border border-slate-300 px-3 py-1.5 text-sm bg-white font-bold text-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="STUDENT">STUDENT</option>
                          <option value="TEACHER">TEACHER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleStatusChange(u.id, !u.isActive)}
                          className={`mr-4 font-bold ${u.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-emerald-600 hover:text-emerald-700'}`}
                        >
                          {u.isActive ? 'Block Account' : 'Activate Account'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="text-rose-600 hover:text-rose-800 font-bold"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
