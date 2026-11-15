'use client';

import { useEffect, useState } from 'react';
import type { AdminUser, ClassView } from '@/lib/types';
import { DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const ADMIN_NAV = [
  { href: '/admin/home', icon: '👥', label: 'User Management', color: 'purple' as const },
  { href: '/admin/classes', icon: '🏛️', label: 'Class Management', color: 'sky' as const },
  { href: '/admin/certificates', icon: '📜', label: 'Certificate Templates', color: 'amber' as const },
  { href: '/admin/badges', icon: '🏆', label: 'Achievement Badges', color: 'emerald' as const },
  { href: '/admin/system', icon: '⚙️', label: 'System Settings & Logs', color: 'orange' as const },
];

export default function AdminClassesPage() {
  const t = useT();
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [name, setName] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => { const [c, u] = await Promise.all([fetch('/api/classes'), fetch('/api/admin/users')]); const cd = await c.json(); const ud = await u.json(); if (c.ok) setClasses(cd.classes); if (u.ok) setTeachers((ud.users as AdminUser[]).filter(x => x.role === 'TEACHER')); };
  useEffect(() => { refresh(); }, []);
  const assignTeacher = async (classId: string, teacherId: string) => { const res = await fetch(`/api/classes/${classId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: teacherId || null }) }); const data = await res.json(); setNotice(res.ok ? 'Teacher assignment updated.' : data.error || 'Could not update assignment'); if (res.ok) refresh(); };
  const create = async (event: React.FormEvent) => { event.preventDefault(); const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, teacherId: teacherId || null }) }); const data = await res.json(); if (res.ok) { setName(''); setTeacherId(''); setNotice(`Created with join code ${data.schoolClass.joinCode}`); refresh(); } else setNotice(data.error || 'Could not create class'); };
  return <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900"><WorkspaceSidebar title="Admin HQ" accent="purple" items={ADMIN_NAV} /><main className="flex-1 p-6 md:p-10 overflow-y-auto"><div className="mx-auto max-w-6xl space-y-7"><header><h1 className="mt-2 text-4xl font-bold">{t('Class management')}</h1><p className="text-slate-500">{t('Create classrooms and assign a teacher.')}</p></header>
    <form onSubmit={create} className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"><input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder={t('Class name')} className="rounded-lg border px-3 py-2"/><select value={teacherId} onChange={e => setTeacherId(e.target.value)} className="rounded-lg border bg-white px-3 py-2"><option value="">{t('No teacher assigned')}</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select><button className="rounded-lg bg-violet-700 px-5 py-2 font-semibold text-white">{t('Create class')}</button>{notice && <p className="md:col-span-3 text-sm text-violet-700"><DynamicText text={notice} /></p>}</form>
    <div className="grid gap-4 sm:grid-cols-2">{classes.map(c => <article key={c.id} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold"><DynamicText text={c.name} /></h2><label className="mt-2 block text-xs font-semibold text-slate-500">{t('Assigned teacher')}<select value={c.teacherId || ''} onChange={e => assignTeacher(c.id, e.target.value)} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="">{t('Unassigned')}</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select></label><p className="mt-3 text-sm">{t('Join code')} <strong className="ml-2 tracking-widest">{c.joinCode}</strong></p><p className="mt-1 text-xs text-slate-500">{c._count.enrollments} {t('enrolled')} · {c._count.exams} {t('exams')}</p></article>)}</div>
  </div></main></div>;
}
