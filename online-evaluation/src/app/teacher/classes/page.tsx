'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClassView, EnrollmentView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';

type LinkedStudent = { id: string; name: string; email: string; avatarUrl?: string | null; cvUrl?: string | null; classNames: string[]; badges: Array<{ badge: { id: string; name: string } }> };
type Badge = { id: string; name: string; imageUrl: string | null };

export default function TeacherClassesPage() {
  useRoleGuard('TEACHER');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [badgeName, setBadgeName] = useState('');
  const [badgeDescription, setBadgeDescription] = useState('');
  const [badgeImage, setBadgeImage] = useState('');
  const [studentBadge, setStudentBadge] = useState<Record<string, string>>({});
  const [certificateClassId, setCertificateClassId] = useState('');
  const [certificateTitle, setCertificateTitle] = useState('Certificate of Academic Integrity');
  const [certificateDescription, setCertificateDescription] = useState('in recognition of academic achievement and commitment to honest work.');
  const [issuerName, setIssuerName] = useState('');
  const [issuingCertificates, setIssuingCertificates] = useState(false);
  const [message, setMessage] = useState('');
  const refresh = async () => {
    const [classRes, studentRes, badgeRes, profileRes] = await Promise.all([fetch('/api/classes'), fetch('/api/teacher/students'), fetch('/api/teacher/badges'), fetch('/api/teacher/profile')]);
    const [classData, studentData, badgeData, profileData] = await Promise.all([classRes.json(), studentRes.json(), badgeRes.json(), profileRes.json()]);
    if (classRes.ok) setClasses(classData.classes || []);
    if (studentRes.ok) setStudents(studentData.students || []);
    if (badgeRes.ok) setBadges(badgeData.badges || []);
    if (profileRes.ok && !issuerName) setIssuerName(profileData.user?.name || '');
  };
  useEffect(() => { refresh(); }, []);
  const createClass = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const data = await res.json();
    if (res.ok) { setName(''); setDescription(''); setMessage(`Class created. Join code: ${data.schoolClass.joinCode}`); refresh(); }
    else setMessage(data.error || 'Could not create class');
  };
  const setEnrollment = async (classId: string, enrollmentId: string, status: string) => {
    const res = await fetch(`/api/classes/${classId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId, status }) });
    if (res.ok) refresh(); else { const data = await res.json(); setMessage(data.error || 'Could not update enrollment'); }
  };
  const removeEnrollment = async (classId: string, enrollmentId: string) => {
    if (!window.confirm('Remove this student from the class?')) return;
    const res = await fetch(`/api/classes/${classId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId }) });
    const data = await res.json(); setMessage(res.ok ? 'Student removed from class.' : data.error || 'Could not remove student'); if (res.ok) refresh();
  };
  const createBadge = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const res = await fetch('/api/teacher/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: badgeName, description: badgeDescription, imageUrl: badgeImage || null }) });
    const data = await res.json();
    if (res.ok) { setBadgeName(''); setBadgeDescription(''); setBadgeImage(''); setMessage('Badge created.'); refresh(); }
    else setMessage(data.error || 'Could not create badge');
  };
  const uploadBadgeImage = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    const res = await fetch('/api/uploads/images', { method: 'POST', body: form }); const data = await res.json();
    if (res.ok) setBadgeImage(data.url); else setMessage(data.error || 'Image upload failed');
  };
  const awardBadge = async (studentId: string) => {
    const res = await fetch('/api/teacher/assign-badge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: studentId, badgeId: studentBadge[studentId] }) });
    const data = await res.json(); setMessage(res.ok ? 'Badge awarded.' : data.error || 'Could not award badge'); if (res.ok) refresh();
  };
  const issueClassCertificates = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setIssuingCertificates(true);
    try {
      const res = await fetch('/api/teacher/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: certificateClassId, examTitle: certificateTitle, description: certificateDescription, issuerName }) });
      const data = await res.json();
      setMessage(res.ok ? `Issued ${data.count} certificate${data.count === 1 ? '' : 's'} successfully.` : data.error || 'Could not issue certificates');
    } catch { setMessage('Could not issue certificates'); }
    finally { setIssuingCertificates(false); }
  };
  return <main className="min-h-screen bg-slate-50 p-6 md:p-10 text-slate-900"><div className="mx-auto max-w-5xl space-y-8">
    <header className="flex items-center justify-between"><div><Link href="/teacher/home" className="text-sm text-emerald-700">← Teacher workspace</Link><h1 className="mt-2 text-3xl font-bold">Classrooms</h1><p className="text-slate-500">Manage enrollment and share join codes with students.</p></div><Link className="rounded-lg border bg-white px-4 py-2" href="/teacher/grading">Grading center →</Link></header>
    <form onSubmit={createClass} className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]"><input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder="Class name" className="rounded-lg border px-3 py-2"/><input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description" className="rounded-lg border px-3 py-2"/><button className="rounded-lg bg-emerald-700 px-5 py-2 font-semibold text-white">Create class</button></form>
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <form onSubmit={issueClassCertificates} className="space-y-4 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm"><div><h2 className="text-xl font-bold text-slate-900">Issue certificates to a class</h2><p className="mt-1 text-sm text-slate-500">Each active, approved student receives a personalized certificate using their account name.</p></div><div className="grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">Class<select required value={certificateClassId} onChange={e => setCertificateClassId(e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2"><option value="">Choose a class</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name} · {(c.enrollments || []).filter(e => e.status === 'APPROVED').length} approved</option>)}</select></label><label className="text-sm font-semibold">Certificate title<input required minLength={3} maxLength={120} value={certificateTitle} onChange={e => setCertificateTitle(e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold">Issued by<input required minLength={2} maxLength={100} value={issuerName} onChange={e => setIssuerName(e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2"/></label><label className="text-sm font-semibold md:row-span-2">Recognition text<textarea maxLength={260} rows={4} value={certificateDescription} onChange={e => setCertificateDescription(e.target.value)} className="mt-1 block w-full rounded-lg border px-3 py-2"/></label></div>{certificateClassId && <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Recipients: {(classes.find(c => c.id === certificateClassId)?.enrollments || []).filter(e => e.status === 'APPROVED').map(e => e.user?.name).filter(Boolean).join(', ') || 'No approved students'}</div>}<button disabled={issuingCertificates || !certificateClassId} className="rounded-lg bg-teal-700 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{issuingCertificates ? 'Issuing…' : 'Issue certificates to approved students'}</button></form>
    <section className="grid gap-5">{classes.map(c => <article key={c.id} className="rounded-2xl border bg-white p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{c.name}</h2><p className="mt-1 text-sm text-slate-500">{c.description || 'No description'} · {c._count?.enrollments || 0} students</p></div><div className="rounded-lg bg-emerald-50 px-4 py-2 text-sm"><span className="text-slate-500">Join code </span><strong className="tracking-widest">{c.joinCode}</strong></div></div>
      <div className="mt-5 divide-y">{(c.enrollments || []).map((e: EnrollmentView) => <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{e.user?.name}</strong><span className="ml-2 text-sm text-slate-500">{e.user?.email}</span></div><div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs ${e.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : e.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{e.status}</span>{e.status !== 'APPROVED' && <button onClick={() => setEnrollment(c.id, e.id, 'APPROVED')} className="text-sm font-semibold text-emerald-700">Approve</button>}{e.status !== 'REJECTED' && <button onClick={() => setEnrollment(c.id, e.id, 'REJECTED')} className="text-sm text-rose-600">Reject</button>}<button onClick={() => removeEnrollment(c.id,e.id)} className="text-sm text-rose-700">Remove</button></div></div>)}</div>
    </article>)}</section>
    <section className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Student CVs</h2><p className="mb-3 text-sm text-slate-500">Open an uploaded CV for any approved student.</p>{students.length === 0 ? <p className="text-sm text-slate-500">No approved students yet.</p> : <div className="divide-y">{students.map(student => <div key={student.id} className="flex items-center justify-between py-3"><span className="font-semibold">{student.name}</span>{student.cvUrl ? <a href={`/api/student/cv?userId=${student.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-600 hover:underline">View CV</a> : <span className="text-sm text-slate-400">No CV uploaded</span>}</div>)}</div>}</section>
    <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <form onSubmit={createBadge} className="h-fit space-y-3 rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Create student badge</h2><input required minLength={2} value={badgeName} onChange={e => setBadgeName(e.target.value)} placeholder="Badge name" className="w-full rounded-lg border px-3 py-2"/><textarea value={badgeDescription} onChange={e => setBadgeDescription(e.target.value)} placeholder="Description (optional)" className="w-full rounded-lg border px-3 py-2"/><label className="block text-sm font-medium">Badge image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => uploadBadgeImage(e.target.files?.[0])} className="mt-1 block w-full text-sm"/></label>{badgeImage && <img src={badgeImage} alt="Badge preview" className="h-20 w-20 rounded-xl object-cover"/>}<button className="rounded-lg bg-emerald-700 px-4 py-2 font-semibold text-white">Create badge</button></form>
      <div className="rounded-2xl border bg-white p-5"><h2 className="text-xl font-bold">Linked students</h2><p className="mb-3 text-sm text-slate-500">Award badges to students enrolled in your classes.</p>{students.length === 0 ? <p className="py-5 text-sm text-slate-500">No approved students yet.</p> : <div className="divide-y">{students.map(student => <div key={student.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><strong>{student.name}</strong><p className="text-sm text-slate-500">{student.email} · {student.classNames.join(', ')}</p><p className="mt-1 text-xs text-amber-700">Badges: {student.badges.map(b => b.badge.name).join(', ') || 'None'}</p></div><div className="flex gap-2"><select aria-label={`Badge for ${student.name}`} value={studentBadge[student.id] || ''} onChange={e => setStudentBadge({ ...studentBadge, [student.id]: e.target.value })} className="max-w-40 rounded-lg border bg-white px-2 py-2"><option value="">Select badge</option>{badges.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button disabled={!studentBadge[student.id]} onClick={() => awardBadge(student.id)} className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Award</button></div></div>)}</div>}</div>
    </section>
  </div></main>;
}
