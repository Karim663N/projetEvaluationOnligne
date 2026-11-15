'use client';

import { useState, useEffect } from 'react';
import { useRoleGuard } from '@/lib/use-role-guard';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const TEACHER_NAV = [
  { href: '/teacher/profile', icon: '👤', label: 'Manage Profile', color: 'sky' as const },
  { href: '/teacher/home', icon: '📝', label: 'My Exams', color: 'emerald' as const },
  { href: '/teacher/classes', icon: '🏛️', label: 'My Classes', color: 'amber' as const },
  { href: '/teacher/grading', icon: '✍️', label: 'Grading Center', color: 'violet' as const },
];

export default function TeacherProfilePage() {
  useRoleGuard('TEACHER');
  const t = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    const res = await fetch('/api/user/avatar', { method: 'POST', body: form }); const data = await res.json();
    if (res.ok) { setAvatarUrl(data.avatarUrl); setMessage('Profile picture uploaded successfully.'); }
    else setMessage(data.error || 'Could not upload profile picture.');
  };

  useEffect(() => {
    fetch('/api/teacher/profile')
      .then(res => res.json())
      .then(data => {
        if (data.user) {
          setName(data.user.name || '');
          setEmail(data.user.email || '');
          setAvatarUrl(data.user.avatarUrl || '');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const res = await fetch('/api/teacher/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, avatarUrl, currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Profile updated successfully.');
        setCurrentPassword(''); setNewPassword('');
      } else {
        setMessage(data.error || 'Failed to update profile.');
      }
    } catch {
      setMessage('Failed to update profile.');
    }
  };

  if (loading) return <div className="p-10 text-center text-slate-500">{t('Loading profile...')}</div>;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <WorkspaceSidebar title="Teacher Studio" accent="emerald" items={TEACHER_NAV} />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-4xl font-black">{t('Manage Profile')}</h1>
          <p className="text-slate-500 text-sm">{t('Update your name, email, avatar, or password.')}</p>
        </div>

        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          {message && <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium"><DynamicText text={message} /></div>}
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('Email Address')}</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-bold text-slate-700">{t('Current password')}</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div><div><label className="mb-2 block text-sm font-bold text-slate-700">{t('New password')}</label><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder={t('Leave blank to keep current')} className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div></div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('Full Name')}</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">{t('Profile picture')}</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => uploadAvatar(e.target.files?.[0])} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-medium" />
            {avatarUrl && (
              <div className="mt-3 flex items-center gap-4">
                <img src={avatarUrl} alt="Avatar Preview" className="h-16 w-16 rounded-full object-cover border border-slate-200 shadow-sm" />
                <span className="text-xs text-slate-400">{t('Avatar Preview')}</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
            >
              {t('Save Profile Changes')}
            </button>
          </div>
        </form>
      </div>
      </main>
    </div>
  );
}
