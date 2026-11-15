'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRoleGuard } from '@/lib/use-role-guard';

export default function TeacherProfilePage() {
  useRoleGuard('TEACHER');
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

  if (loading) return <div className="p-10 text-center text-slate-500">Loading profile...</div>;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <Link href="/teacher/home" className="text-sm font-semibold text-emerald-600 hover:underline">← Back to Teacher Studio</Link>
          <h1 className="mt-2 text-3xl font-black">Manage Profile</h1>
          <p className="text-slate-500 text-sm">Update your name, email, avatar, or password.</p>
        </div>

        <form onSubmit={handleSave} className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          {message && <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium">{message}</div>}
          
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2"><div><label className="mb-2 block text-sm font-bold text-slate-700">Current password</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div><div><label className="mb-2 block text-sm font-bold text-slate-700">New password</label><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full rounded-xl border border-slate-300 px-4 py-3"/></div></div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Profile picture</label>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => uploadAvatar(e.target.files?.[0])} className="w-full rounded-xl border border-slate-300 px-4 py-3 font-medium" />
            {avatarUrl && (
              <div className="mt-3 flex items-center gap-4">
                <img src={avatarUrl} alt="Avatar Preview" className="h-16 w-16 rounded-full object-cover border border-slate-200 shadow-sm" />
                <span className="text-xs text-slate-400">Avatar Preview</span>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-slate-100 flex justify-end">
            <button
              type="submit"
              className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
            >
              Save Profile Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
