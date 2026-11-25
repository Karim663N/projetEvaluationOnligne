'use client';

import { useEffect, useState } from 'react';
import type { BadgeView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, IconBubble, PageHeader } from '@/components/ui/kit';

export default function BadgesPage() {
  useRoleGuard('ADMIN');
  const [badges, setBadges] = useState<BadgeView[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => { const res = await fetch('/api/admin/badges'); const data = await res.json(); if (res.ok) setBadges(data.badges); };
  useEffect(() => { refresh(); }, []);
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/admin/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const data = await res.json();
    setNotice(res.ok ? 'Badge ajouté au catalogue.' : data.error || 'Création du badge impossible');
    if (res.ok) { setName(''); setDescription(''); refresh(); }
  };
  return (
    <AppShell role="ADMIN" active="badges">
      <PageHeader eyebrow="Plateforme" title="Badges" subtitle="Le catalogue de distinctions que les enseignants peuvent attribuer." />
      <form onSubmit={create} className="eg-card grid gap-3 p-5 md:grid-cols-[1fr_2fr_auto] md:items-end">
        <label><span className="eg-label">Nom</span><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Major de promotion" className="eg-input" /></label>
        <label><span className="eg-label">Description</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Facultatif" className="eg-input" /></label>
        <button className="eg-btn eg-btn-primary"><Icon name="plus" className="h-4 w-4" />Ajouter</button>
      </form>
      {notice && <div className="eg-alert eg-alert-info mt-4">{notice}</div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {badges.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon="award" title="Aucun badge" text="Ajoutez le premier badge du catalogue." /></div>}
        {badges.map((b) => (
          <article key={b.id} className="eg-card eg-card-hover flex gap-4 p-5">
            <IconBubble icon="award" tone="amber" className="h-12 w-12" />
            <div className="min-w-0">
              <h2 className="truncate font-semibold text-slate-900">{b.name}</h2>
              <p className="line-clamp-2 text-sm text-slate-500">{b.description || 'Pas de description'}</p>
              <p className="mt-2 text-xs font-medium text-brand-600">Attribué à {b._count?.users ?? 0} étudiant(s)</p>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
