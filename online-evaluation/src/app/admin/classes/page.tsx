'use client';

import { useEffect, useState } from 'react';
import type { AdminUser, ClassView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, IconBubble, PageHeader } from '@/components/ui/kit';

export default function AdminClassesPage() {
  useRoleGuard('ADMIN');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [name, setName] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async () => {
    const [c, u] = await Promise.all([fetch('/api/classes'), fetch('/api/admin/users')]);
    const cd = await c.json(); const ud = await u.json();
    if (c.ok) setClasses(cd.classes);
    if (u.ok) setTeachers((ud.users as AdminUser[]).filter((x) => x.role === 'TEACHER'));
  };
  useEffect(() => { refresh(); }, []);

  const assignTeacher = async (classId: string, id: string) => {
    const res = await fetch(`/api/classes/${classId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: id || null }) });
    const data = await res.json(); setNotice(res.ok ? 'Enseignant affecté.' : data.error || 'Affectation impossible'); if (res.ok) refresh();
  };
  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, teacherId: teacherId || null }) });
    const data = await res.json();
    if (res.ok) { setName(''); setTeacherId(''); setNotice(`Classe créée, code d’invitation ${data.schoolClass.joinCode}`); refresh(); }
    else setNotice(data.error || 'Création impossible');
  };

  return (
    <AppShell role="ADMIN" active="classes">
      <PageHeader eyebrow="Plateforme" title="Classes" subtitle="Créez des classes et affectez-leur un enseignant." />
      <form onSubmit={create} className="eg-card grid gap-3 p-5 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label><span className="eg-label">Nom de la classe</span><input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} placeholder="Ex. : M1 Data Science" className="eg-input" /></label>
        <label><span className="eg-label">Enseignant</span>
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="eg-input">
            <option value="">Aucun enseignant</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}
          </select>
        </label>
        <button className="eg-btn eg-btn-primary"><Icon name="plus" className="h-4 w-4" />Créer la classe</button>
      </form>
      {notice && <div className="eg-alert eg-alert-info mt-4">{notice}</div>}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {classes.length === 0 && <div className="sm:col-span-2 xl:col-span-3"><EmptyState icon="cap" title="Aucune classe" /></div>}
        {classes.map((c) => (
          <article key={c.id} className="eg-card eg-card-hover p-5">
            <div className="flex items-start gap-3">
              <IconBubble icon="cap" tone="violet" />
              <div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{c.name}</h2><p className="text-xs text-slate-500">{c._count.enrollments} inscrit(s) · {c._count.exams} examen(s)</p></div>
            </div>
            <label className="mt-4 block"><span className="eg-label">Enseignant affecté</span>
              <select value={c.teacherId || ''} onChange={(e) => assignTeacher(c.id, e.target.value)} className="eg-input">
                <option value="">Non affecté</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}
              </select>
            </label>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2 text-sm ring-1 ring-brand-100">
              <span className="text-brand-700">Code d’invitation</span><strong className="font-mono tracking-[0.2em] text-brand-800">{c.joinCode}</strong>
            </div>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
