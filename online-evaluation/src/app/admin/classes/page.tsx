'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AdminUser, ClassView } from '@/lib/types';

export default function AdminClassesPage() {
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [teachers, setTeachers] = useState<AdminUser[]>([]);
  const [name, setName] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = async () => { const [c, u] = await Promise.all([fetch('/api/classes'), fetch('/api/admin/users')]); const cd = await c.json(); const ud = await u.json(); if (c.ok) setClasses(cd.classes); if (u.ok) setTeachers((ud.users as AdminUser[]).filter(x => x.role === 'TEACHER')); };
  useEffect(() => { refresh(); }, []);
  const assignTeacher = async (classId: string, teacherId: string) => { const res = await fetch(`/api/classes/${classId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: teacherId || null }) }); const data = await res.json(); setNotice(res.ok ? 'Teacher assignment updated.' : data.error || 'Could not update assignment'); if (res.ok) refresh(); };
  const create = async (event: React.FormEvent) => { event.preventDefault(); const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, teacherId: teacherId || null }) }); const data = await res.json(); if (res.ok) { setName(''); setTeacherId(''); setNotice(`Created with join code ${data.schoolClass.joinCode}`); refresh(); } else setNotice(data.error || 'Could not create class'); };
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900"><div className="mx-auto max-w-5xl space-y-7"><header><Link href="/admin/home" className="text-sm text-violet-700">← Admin dashboard</Link><h1 className="mt-2 text-3xl font-bold">Class management</h1><p className="text-slate-500">Create classrooms and assign a teacher.</p></header>
    <form onSubmit={create} className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"><input value={name} onChange={e => setName(e.target.value)} required minLength={2} placeholder="Class name" className="rounded-lg border px-3 py-2"/><select value={teacherId} onChange={e => setTeacherId(e.target.value)} className="rounded-lg border bg-white px-3 py-2"><option value="">No teacher assigned</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select><button className="rounded-lg bg-violet-700 px-5 py-2 font-semibold text-white">Create class</button>{notice && <p className="md:col-span-3 text-sm text-violet-700">{notice}</p>}</form>
    <div className="grid gap-4 sm:grid-cols-2">{classes.map(c => <article key={c.id} className="rounded-2xl border bg-white p-5"><h2 className="text-lg font-bold">{c.name}</h2><label className="mt-2 block text-xs font-semibold text-slate-500">Assigned teacher<select value={c.teacherId || ''} onChange={e => assignTeacher(c.id, e.target.value)} className="mt-1 block w-full rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Unassigned</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.name} · {t.email}</option>)}</select></label><p className="mt-3 text-sm">Join code <strong className="ml-2 tracking-widest">{c.joinCode}</strong></p><p className="mt-1 text-xs text-slate-500">{c._count.enrollments} enrolled · {c._count.exams} exams</p></article>)}</div>
  </div></main>;
}
