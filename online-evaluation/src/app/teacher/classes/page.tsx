'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ClassView, EnrollmentView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import { DynamicText, useT } from '@/lib/i18n-context';
import SignaturePad from '@/components/SignaturePad';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

const TEACHER_NAV = [
  { href: '/teacher/profile', icon: '👤', label: 'Manage Profile', color: 'sky' as const },
  { href: '/teacher/home', icon: '📝', label: 'My Exams', color: 'emerald' as const },
  { href: '/teacher/classes', icon: '🏛️', label: 'My Classes', color: 'amber' as const },
  { href: '/teacher/grading', icon: '✍️', label: 'Grading Center', color: 'violet' as const },
];

type LinkedStudent = { id: string; name: string; email: string; avatarUrl?: string | null; cvUrl?: string | null; classNames: string[]; badges: Array<{ badge: { id: string; name: string } }> };
type Badge = { id: string; name: string; imageUrl: string | null };
type CertificateTemplateItem = { id: string; title: string; description?: string | null; issuerName?: string | null };

export default function TeacherClassesPage() {
  useRoleGuard('TEACHER');
  const t = useT();
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [students, setStudents] = useState<LinkedStudent[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [templates, setTemplates] = useState<CertificateTemplateItem[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [badgeName, setBadgeName] = useState('');
  const [badgeDescription, setBadgeDescription] = useState('');
  const [badgeImage, setBadgeImage] = useState('');
  const [studentBadge, setStudentBadge] = useState<Record<string, string>>({});
  
  // Certificate issuance state
  const [certificateClassId, setCertificateClassId] = useState('');
  const [certificateStudentId, setCertificateStudentId] = useState('');
  const [certificateTitle, setCertificateTitle] = useState('Certificate of Academic Integrity');
  const [certificateDescription, setCertificateDescription] = useState('in recognition of academic achievement and commitment to honest work.');
  const [issuerName, setIssuerName] = useState('');
  const [certSignature, setCertSignature] = useState<string | null>(null);
  const [issuingCertificates, setIssuingCertificates] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const [classRes, studentRes, badgeRes, profileRes, templateRes] = await Promise.all([
      fetch('/api/classes'),
      fetch('/api/teacher/students'),
      fetch('/api/teacher/badges'),
      fetch('/api/teacher/profile'),
      fetch('/api/admin/certificate-templates'),
    ]);
    const [classData, studentData, badgeData, profileData, templateData] = await Promise.all([
      classRes.json(),
      studentRes.json(),
      badgeRes.json(),
      profileRes.json(),
      templateRes.json(),
    ]);
    if (classRes.ok) setClasses(classData.classes || []);
    if (studentRes.ok) setStudents(studentData.students || []);
    if (badgeRes.ok) setBadges(badgeData.badges || []);
    if (profileRes.ok && !issuerName) setIssuerName(profileData.user?.name || '');
    if (templateRes.ok) setTemplates(templateData.templates || []);
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

  const issueCertificates = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setIssuingCertificates(true);
    try {
      const res = await fetch('/api/teacher/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: certificateClassId || null,
          userId: certificateStudentId || null,
          examTitle: certificateTitle,
          description: certificateDescription,
          issuerName,
          signatureDataUrl: certSignature,
        }),
      });
      const data = await res.json();
      setMessage(res.ok ? `Issued ${data.count} certificate${data.count === 1 ? '' : 's'} successfully.` : data.error || 'Could not issue certificates');
    } catch { setMessage('Could not issue certificates'); }
    finally { setIssuingCertificates(false); }
  };

  const applyTemplate = (tmpl: CertificateTemplateItem) => {
    setCertificateTitle(tmpl.title);
    if (tmpl.description) setCertificateDescription(tmpl.description);
    if (tmpl.issuerName) setIssuerName(tmpl.issuerName);
    setMessage(`Loaded certificate template: ${tmpl.title}`);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <WorkspaceSidebar title="Teacher Studio" accent="emerald" items={TEACHER_NAV} />
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="mt-2 text-4xl font-bold">{t('Classrooms & Certificates')}</h1>
            <p className="text-slate-500">{t('Manage enrollment, award badges, and issue certificates to classes or individual students.')}</p>
          </div>
          <Link className="rounded-xl border bg-white px-4 py-2 font-semibold shadow-sm hover:bg-slate-50 transition-all" href="/teacher/grading">{t('Grading center')} →</Link>
        </header>

        <form onSubmit={createClass} className="grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-[1fr_1fr_auto]">
          <input required minLength={2} value={name} onChange={e => setName(e.target.value)} placeholder={t('Class name')} className="rounded-xl border px-4 py-2.5 text-sm"/>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder={t('Description')} className="rounded-xl border px-4 py-2.5 text-sm"/>
          <button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white shadow-md hover:bg-emerald-700 transition-all">{t('Create class')}</button>
        </form>

        {message && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-800"><DynamicText text={message} /></p>}

        {/* Certificate Templates & Issuance Section */}
        <section className="space-y-6 rounded-2xl border border-teal-100 bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-bold text-slate-900">{t('Certificate Templates Catalog')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('Click any certificate template below to instantly load its title, issuer, and description.')}</p>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-slate-400 italic">{t('No certificate templates created by admin yet.')}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {templates.map(tmpl => (
                <div key={tmpl.id} onClick={() => applyTemplate(tmpl)} className="cursor-pointer rounded-xl border border-slate-200 bg-slate-50 p-4 hover:border-teal-500 hover:bg-teal-50/30 transition-all shadow-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-2xl">📜</span>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm"><DynamicText text={tmpl.title} /></h3>
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">{tmpl.description ? <DynamicText text={tmpl.description} /> : t('No description')}</p>
                    </div>
                  </div>
                  <div className="mt-3 text-right">
                    <span className="text-xs font-bold text-teal-700 bg-teal-100 px-2.5 py-1 rounded-lg">{t('Use Template →')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={issueCertificates} className="space-y-4 pt-6 border-t border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{t('Issue Certificates')}</h3>
              <p className="mt-1 text-sm text-slate-500">{t('Issue to an entire class or select an individual student.')}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-semibold">{t('Target Class (Issue to all approved class students)')}
                <select value={certificateClassId} onChange={e => { setCertificateClassId(e.target.value); if (e.target.value) setCertificateStudentId(''); }} className="mt-1 block w-full rounded-xl border px-4 py-2.5 bg-white text-sm">
                  <option value="">{t('None (Select individual student instead)')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{t(c.name)} · {(c.enrollments || []).filter(e => e.status === 'APPROVED').length} {t('approved')}</option>)}
                </select>
              </label>

              <label className="text-sm font-semibold">{t('Or Specific Student (Individual issuance)')}
                <select value={certificateStudentId} onChange={e => { setCertificateStudentId(e.target.value); if (e.target.value) setCertificateClassId(''); }} className="mt-1 block w-full rounded-xl border px-4 py-2.5 bg-white text-sm">
                  <option value="">{t('None (Issue to entire class)')}</option>
                  {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.email})</option>)}
                </select>
              </label>

              <label className="text-sm font-semibold">{t('Certificate title')}
                <input required minLength={3} maxLength={120} value={certificateTitle} onChange={e => setCertificateTitle(e.target.value)} className="mt-1 block w-full rounded-xl border px-4 py-2.5 text-sm"/>
              </label>
              <label className="text-sm font-semibold">{t('Issued by')}
                <input required minLength={2} maxLength={100} value={issuerName} onChange={e => setIssuerName(e.target.value)} className="mt-1 block w-full rounded-xl border px-4 py-2.5 text-sm"/>
              </label>
              <label className="text-sm font-semibold md:col-span-2">{t('Recognition text')}
                <textarea maxLength={260} rows={3} value={certificateDescription} onChange={e => setCertificateDescription(e.target.value)} className="mt-1 block w-full rounded-xl border px-4 py-2.5 text-sm"/>
              </label>
              <div className="text-sm font-semibold md:col-span-2">
                {t('Digital signature (optional)')}
                <p className="mt-1 text-xs font-normal text-slate-500">{t('Draw your signature below. It will be printed on the issued certificates.')}</p>
                <div className="mt-2 max-w-xl">
                  <SignaturePad onChange={setCertSignature} disabled={issuingCertificates} />
                </div>
              </div>
            </div>

            {certificateClassId && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                {t('Recipients (Class):')} {(classes.find(c => c.id === certificateClassId)?.enrollments || []).filter(e => e.status === 'APPROVED').map(e => e.user?.name).filter(Boolean).join(', ') || t('No approved students')}
              </div>
            )}
            {certificateStudentId && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                {t('Recipient (Student):')} {students.find(s => s.id === certificateStudentId)?.name}
              </div>
            )}

            <button disabled={issuingCertificates || (!certificateClassId && !certificateStudentId)} className="rounded-xl bg-teal-700 px-6 py-3 text-sm font-bold text-white shadow-md hover:bg-teal-800 disabled:opacity-50 transition-all">
              {issuingCertificates ? t('Issuing certificates...') : t('Issue Certificate(s)')}
            </button>
          </form>
        </section>

        <section className="grid gap-5">
          {classes.map(c => (
            <article key={c.id} className="rounded-2xl border bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold"><DynamicText text={c.name} /></h2>
                  <p className="mt-1 text-sm text-slate-500">{c.description ? <DynamicText text={c.description} /> : t('No description')} · {c._count?.enrollments || 0} {t('students')}</p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-4 py-2 text-sm">
                  <span className="text-slate-500">{t('Join code')} </span>
                  <strong className="tracking-widest text-emerald-700">{c.joinCode}</strong>
                </div>
              </div>
              <div className="mt-5 divide-y">
                {(c.enrollments || []).map((e: EnrollmentView) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <strong className="text-slate-900">{e.user?.name}</strong>
                      <span className="ml-2 text-sm text-slate-500">{e.user?.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${e.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : e.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                        {t(e.status)}
                      </span>
                      {e.status !== 'APPROVED' && <button onClick={() => setEnrollment(c.id, e.id, 'APPROVED')} className="text-sm font-semibold text-emerald-700 hover:underline">{t('Approve')}</button>}
                      {e.status !== 'REJECTED' && <button onClick={() => setEnrollment(c.id, e.id, 'REJECTED')} className="text-sm font-semibold text-rose-600 hover:underline">{t('Reject')}</button>}
                      <button onClick={() => removeEnrollment(c.id, e.id)} className="text-sm font-semibold text-rose-700 hover:underline">{t('Remove')}</button>
                      <button onClick={() => { setCertificateStudentId(e.user?.id || ''); setCertificateClassId(''); window.scrollTo({ top: 400, behavior: 'smooth' }); }} className="text-sm font-semibold text-teal-700 hover:underline">{t('Issue Cert')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">{t('Student CVs')}</h2>
          <p className="mb-4 text-sm text-slate-500">{t('Open an uploaded CV for any approved student.')}</p>
          {students.length === 0 ? (
            <p className="text-sm text-slate-500">{t('No approved students yet.')}</p>
          ) : (
            <div className="divide-y">
              {students.map(student => (
                <div key={student.id} className="flex items-center justify-between py-3">
                  <span className="font-semibold text-slate-900">{student.name}</span>
                  {student.cvUrl ? (
                    <a href={`/api/student/cv?userId=${student.id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-blue-600 hover:underline">{t('View CV')}</a>
                  ) : (
                    <span className="text-sm text-slate-400">{t('No CV uploaded')}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
          <form onSubmit={createBadge} className="h-fit space-y-4 rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">{t('Create student badge')}</h2>
            <input required minLength={2} value={badgeName} onChange={e => setBadgeName(e.target.value)} placeholder={t('Badge name')} className="w-full rounded-xl border px-4 py-2.5 text-sm"/>
            <textarea value={badgeDescription} onChange={e => setBadgeDescription(e.target.value)} placeholder={t('Description (optional)')} className="w-full rounded-xl border px-4 py-2.5 text-sm" rows={3}/>
            <label className="block text-sm font-semibold">{t('Badge image')}
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => uploadBadgeImage(e.target.files?.[0])} className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700"/>
            </label>
            {badgeImage && <img src={badgeImage} alt="Badge preview" className="h-20 w-20 rounded-xl object-cover border"/>}
            <button className="rounded-xl bg-emerald-600 px-5 py-2.5 font-bold text-white shadow-md hover:bg-emerald-700 transition-all">{t('Create badge')}</button>
          </form>

          <div className="rounded-2xl border bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold">{t('Linked students')}</h2>
            <p className="mb-4 text-sm text-slate-500">{t('Award badges or issue custom certificates to individual students.')}</p>
            {students.length === 0 ? (
              <p className="py-5 text-sm text-slate-500">{t('No approved students yet.')}</p>
            ) : (
              <div className="divide-y">
                {students.map(student => (
                  <div key={student.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div>
                      <strong className="text-slate-900">{student.name}</strong>
                      <p className="text-sm text-slate-500">{student.email} · <DynamicText text={student.classNames.join(', ')} /></p>
                      <p className="mt-1 text-xs font-semibold text-amber-700">{t('Badges:')} {student.badges.length ? <DynamicText text={student.badges.map(b => b.badge.name).join(', ')} /> : t('None')}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <select aria-label={`Badge for ${student.name}`} value={studentBadge[student.id] || ''} onChange={e => setStudentBadge({ ...studentBadge, [student.id]: e.target.value })} className="max-w-40 rounded-xl border bg-white px-3 py-2 text-sm font-medium">
                        <option value="">{t('Select badge')}</option>
                        {badges.map(b => <option key={b.id} value={b.id}>{t(b.name)}</option>)}
                      </select>
                      <button disabled={!studentBadge[student.id]} onClick={() => awardBadge(student.id)} className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-all">{t('Award')}</button>
                      <button onClick={() => { setCertificateStudentId(student.id); setCertificateClassId(''); window.scrollTo({ top: 400, behavior: 'smooth' }); }} className="rounded-xl bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700 shadow-sm hover:bg-teal-100 transition-all">{t('Custom Cert')}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
      </main>
    </div>
  );
}
