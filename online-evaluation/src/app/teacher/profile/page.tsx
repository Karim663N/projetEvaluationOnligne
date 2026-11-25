'use client';

import { useEffect, useState } from 'react';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, PageHeader } from '@/components/ui/kit';

export default function TeacherProfilePage() {
  useRoleGuard('TEACHER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/teacher/profile').then((res) => res.json()).then((data) => {
      if (data.user) { setName(data.user.name || ''); setEmail(data.user.email || ''); setAvatarUrl(data.user.avatarUrl || ''); }
    }).finally(() => setLoading(false));
  }, []);

  const uploadAvatar = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    const res = await fetch('/api/user/avatar', { method: 'POST', body: form }); const data = await res.json();
    if (res.ok) { setAvatarUrl(data.avatarUrl); setMessage({ ok: true, text: 'Photo de profil mise à jour.' }); }
    else setMessage({ ok: false, text: data.error || 'Import de la photo impossible.' });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    try {
      const res = await fetch('/api/teacher/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, avatarUrl, currentPassword, newPassword }) });
      const data = await res.json();
      if (res.ok) { setMessage({ ok: true, text: 'Profil enregistré.' }); setCurrentPassword(''); setNewPassword(''); }
      else setMessage({ ok: false, text: data.error || 'Enregistrement impossible.' });
    } catch {
      setMessage({ ok: false, text: 'Enregistrement impossible.' });
    }
  };

  return (
    <AppShell role="TEACHER" active="profile">
      <PageHeader eyebrow="Compte" title="Profil" subtitle="Votre nom, votre adresse e-mail, votre photo et votre mot de passe." />
      {loading ? <div className="eg-card h-64 animate-pulse bg-slate-100/60" /> : (
        <div className="grid gap-5 lg:grid-cols-[1fr_1.6fr]">
          <div className="eg-card overflow-hidden">
            <div className="h-24 eg-aurora" />
            <div className="-mt-10 px-6 pb-6 text-center">
              <Avatar name={name} src={avatarUrl || null} className="mx-auto h-20 w-20 text-2xl ring-4 ring-white" />
              <p className="mt-3 text-lg font-semibold text-slate-900">{name || '—'}</p>
              <p className="text-sm text-slate-500">{email}</p>
              <span className="eg-badge eg-badge-brand mt-3">Enseignant</span>
              <div className="mt-5">
                <label className="eg-btn eg-btn-secondary eg-btn-sm cursor-pointer"><Icon name="upload" className="h-3.5 w-3.5" />Changer la photo
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadAvatar(e.target.files?.[0])} className="hidden" />
                </label>
              </div>
            </div>
          </div>
          <form onSubmit={handleSave} className="eg-card grid gap-4 p-6 sm:grid-cols-2">
            {message && <div className={`eg-alert sm:col-span-2 ${message.ok ? 'eg-alert-success' : 'eg-alert-error'}`}>{message.text}</div>}
            <p className="eg-h2 sm:col-span-2">Informations</p>
            <label><span className="eg-label">Nom complet</span><input required value={name} onChange={(e) => setName(e.target.value)} className="eg-input" /></label>
            <label><span className="eg-label">Adresse e-mail</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="eg-input" /></label>
            <p className="eg-h2 mt-2 sm:col-span-2">Sécurité</p>
            <label><span className="eg-label">Mot de passe actuel</span><input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="eg-input" /></label>
            <label><span className="eg-label">Nouveau mot de passe</span><input type="password" autoComplete="new-password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Laisser vide pour conserver" className="eg-input" /></label>
            <div className="flex justify-end border-t border-slate-100 pt-4 sm:col-span-2">
              <button type="submit" className="eg-btn eg-btn-primary">Enregistrer les modifications</button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
