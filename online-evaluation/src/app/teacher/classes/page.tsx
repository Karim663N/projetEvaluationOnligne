'use client';

import { useEffect, useState } from 'react';
import type { ClassView, EnrollmentView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import AppShell from '@/components/shell/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Avatar, EmptyState, IconBubble, PageHeader, StatCard } from '@/components/ui/kit';
import { DynamicText, useT } from '@/lib/dynamic-text';

type LinkedStudent = { id: string; name: string; email: string; avatarUrl?: string | null; cvUrl?: string | null; classNames: string[]; badges: Array<{ badge: { id: string; name: string } }> };
type Badge = { id: string; name: string; imageUrl: string | null };
type View = 'classes' | 'students' | 'certificates';

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', APPROVED: 'Inscrit', REJECTED: 'Refusé' };

export default function TeacherClassesPage() {
  useRoleGuard('TEACHER');
  const t = useT();
  const [view, setView] = useState<View>('classes');
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
  const [copied, setCopied] = useState('');

  const refresh = async () => {
    const [classRes, studentRes, badgeRes, profileRes] = await Promise.all([fetch('/api/classes'), fetch('/api/teacher/students'), fetch('/api/teacher/badges'), fetch('/api/teacher/profile')]);
    const [classData, studentData, badgeData, profileData] = await Promise.all([classRes.json(), studentRes.json(), badgeRes.json(), profileRes.json()]);
    if (classRes.ok) setClasses(classData.classes || []);
    if (studentRes.ok) setStudents(studentData.students || []);
    if (badgeRes.ok) setBadges(badgeData.badges || []);
    if (profileRes.ok) setIssuerName((cur) => cur || profileData.user?.name || '');
  };
  useEffect(() => { refresh(); }, []);

  const createClass = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const res = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, description }) });
    const data = await res.json();
    if (res.ok) { setName(''); setDescription(''); setMessage(`Classe créée. Code d’invitation : ${data.schoolClass.joinCode}`); refresh(); }
    else setMessage(data.error || 'Création de la classe impossible');
  };
  const setEnrollment = async (classId: string, enrollmentId: string, status: string) => {
    const res = await fetch(`/api/classes/${classId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId, status }) });
    if (res.ok) refresh(); else { const data = await res.json(); setMessage(data.error || 'Mise à jour de l’inscription impossible'); }
  };
  const removeEnrollment = async (classId: string, enrollmentId: string) => {
    if (!window.confirm('Retirer cet étudiant de la classe ?')) return;
    const res = await fetch(`/api/classes/${classId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enrollmentId }) });
    const data = await res.json(); setMessage(res.ok ? 'Étudiant retiré de la classe.' : data.error || 'Retrait impossible'); if (res.ok) refresh();
  };
  const createBadge = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage('');
    const res = await fetch('/api/teacher/badges', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: badgeName, description: badgeDescription, imageUrl: badgeImage || null }) });
    const data = await res.json();
    if (res.ok) { setBadgeName(''); setBadgeDescription(''); setBadgeImage(''); setMessage('Badge créé.'); refresh(); }
    else setMessage(data.error || 'Création du badge impossible');
  };
  const uploadBadgeImage = async (file?: File) => {
    if (!file) return;
    const form = new FormData(); form.set('file', file);
    const res = await fetch('/api/uploads/images', { method: 'POST', body: form }); const data = await res.json();
    if (res.ok) setBadgeImage(data.url); else setMessage(data.error || 'Import de l’image impossible');
  };
  const awardBadge = async (studentId: string) => {
    const res = await fetch('/api/teacher/assign-badge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: studentId, badgeId: studentBadge[studentId] }) });
    const data = await res.json(); setMessage(res.ok ? 'Badge attribué.' : data.error || 'Attribution impossible'); if (res.ok) refresh();
  };
  const issueClassCertificates = async (event: React.FormEvent) => {
    event.preventDefault(); setMessage(''); setIssuingCertificates(true);
    try {
      const res = await fetch('/api/teacher/certificates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId: certificateClassId, examTitle: certificateTitle, description: certificateDescription, issuerName }) });
      const data = await res.json();
      setMessage(res.ok ? `${data.count} certificat${data.count === 1 ? '' : 's'} délivré${data.count === 1 ? '' : 's'}.` : data.error || 'Délivrance impossible');
    } catch { setMessage('Délivrance impossible'); }
    finally { setIssuingCertificates(false); }
  };
  const copyCode = async (code: string) => { try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(''), 1500); } catch { /* */ } };

  const pending = classes.reduce((s, c) => s + (c.enrollments || []).filter((e) => e.status === 'PENDING').length, 0);
  const recipients = (classes.find((c) => c.id === certificateClassId)?.enrollments || []).filter((e) => e.status === 'APPROVED');

  return (
    <AppShell role="TEACHER" active="classes">
      <PageHeader eyebrow={t('Enseignement')} title={t('Classes')} subtitle={t('Gérez les inscriptions, partagez les codes d’invitation, valorisez vos étudiants.')} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label={t('Classes')} value={classes.length} icon="cap" tone="brand" />
        <StatCard label={t('Étudiants inscrits')} value={students.length} icon="users" tone="green" />
        <StatCard label={t('Demandes en attente')} value={pending} icon="clock" tone="amber" />
        <StatCard label={t('Badges créés')} value={badges.length} icon="award" tone="violet" />
      </div>

      {message && <div role="status" className="eg-alert eg-alert-info mt-5 flex items-center justify-between gap-3"><DynamicText text={message} /><button onClick={() => setMessage('')} aria-label={t('Fermer')}><Icon name="x" className="h-4 w-4" /></button></div>}

      <div className="eg-segmented mb-5 mt-7" role="group" aria-label={t('Section')}>
        {([['classes', 'Classes & inscriptions'], ['students', 'Étudiants & badges'], ['certificates', 'Certificats']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setView(k)} aria-pressed={view === k}>{t(l)}{k === 'classes' && pending > 0 && <span className="ms-1.5 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink-950">{pending}</span>}</button>
        ))}
      </div>

      {view === 'classes' && (
        <div className="space-y-5">
          <form onSubmit={createClass} className="eg-card grid gap-3 p-5 md:grid-cols-[1fr_1.4fr_auto] md:items-end">
            <label><span className="eg-label">{t('Nom de la classe')}</span><input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Ex. : L2 Informatique — G1')} className="eg-input" /></label>
            <label><span className="eg-label">{t('Description')}</span><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('Facultatif')} className="eg-input" /></label>
            <button className="eg-btn eg-btn-primary"><Icon name="plus" className="h-4 w-4" />{t('Créer la classe')}</button>
          </form>
          {classes.length === 0 && <EmptyState icon="cap" title={t('Aucune classe')} text={t('Créez une classe puis partagez son code d’invitation avec vos étudiants.')} />}
          <div className="grid gap-5 xl:grid-cols-2">
            {classes.map((c) => (
              <article key={c.id} className="eg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <IconBubble icon="cap" tone="violet" />
                    <div className="min-w-0"><h2 className="truncate font-semibold text-slate-900">{c.name}</h2><p className="text-sm text-slate-500">{c.description || t('Pas de description')} · {c._count?.enrollments || 0} {t((c._count?.enrollments || 0) > 1 ? 'étudiants' : 'étudiant')}</p></div>
                  </div>
                  <button onClick={() => copyCode(c.joinCode)} className="group flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-100 transition hover:bg-brand-100" title={t('Copier le code')}>
                    <span className="font-mono text-sm font-bold tracking-[0.2em] text-brand-700">{c.joinCode}</span>
                    <Icon name={copied === c.joinCode ? 'check' : 'copy'} className="h-4 w-4 text-brand-500" />
                  </button>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {(c.enrollments || []).length === 0 && <p className="py-3 text-sm text-slate-500">{t('Aucune inscription pour l’instant.')}</p>}
                  {(c.enrollments || []).map((e: EnrollmentView) => (
                    <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="flex min-w-0 items-center gap-3"><Avatar name={e.user?.name} className="h-8 w-8 text-xs" /><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{e.user?.name}</p><p className="truncate text-xs text-slate-500">{e.user?.email}</p></div></div>
                      <div className="flex items-center gap-1.5">
                        <span className={`eg-badge ${e.status === 'PENDING' ? 'eg-badge-amber' : e.status === 'APPROVED' ? 'eg-badge-green' : 'eg-badge-slate'}`}>{t(STATUS_LABEL[e.status] ?? e.status)}</span>
                        {e.status !== 'APPROVED' && <button onClick={() => setEnrollment(c.id, e.id, 'APPROVED')} className="eg-btn eg-btn-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100">{t('Accepter')}</button>}
                        {e.status !== 'REJECTED' && <button onClick={() => setEnrollment(c.id, e.id, 'REJECTED')} className="eg-btn eg-btn-ghost eg-btn-sm">{t('Refuser')}</button>}
                        <button onClick={() => removeEnrollment(c.id, e.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={t('Retirer')}><Icon name="trash" className="h-4 w-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {view === 'students' && (
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.5fr]">
          <form onSubmit={createBadge} className="eg-card h-fit space-y-4 p-5">
            <p className="eg-h2 flex items-center gap-2"><Icon name="award" className="h-4 w-4 text-amber-500" />{t('Nouveau badge')}</p>
            <label className="block"><span className="eg-label">{t('Nom')}</span><input required minLength={2} value={badgeName} onChange={(e) => setBadgeName(e.target.value)} placeholder={t('Ex. : Esprit d’équipe')} className="eg-input" /></label>
            <label className="block"><span className="eg-label">{t('Description')}</span><textarea value={badgeDescription} onChange={(e) => setBadgeDescription(e.target.value)} placeholder={t('Facultatif')} rows={2} className="eg-input" /></label>
            <label className="block"><span className="eg-label">{t('Image')}</span><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(e) => uploadBadgeImage(e.target.files?.[0])} className="eg-file" /></label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {badgeImage && <img src={badgeImage} alt={t('Aperçu du badge')} className="h-16 w-16 rounded-xl object-cover" />}
            <button className="eg-btn eg-btn-primary w-full">{t('Créer le badge')}</button>
          </form>
          <div className="eg-card overflow-hidden">
            <div className="border-b border-slate-100 px-5 py-4"><p className="eg-h2">{t('Étudiants inscrits')}</p><p className="text-sm text-slate-500">{t('Attribuez des badges et consultez les CV.')}</p></div>
            {students.length === 0 ? <div className="p-5"><EmptyState icon="users" title={t('Aucun étudiant inscrit')} text={t('Acceptez des demandes d’inscription dans vos classes.')} /></div> : (
              <div className="divide-y divide-slate-100">
                {students.map((student) => (
                  <div key={student.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                    <Avatar name={student.name} src={student.avatarUrl} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{student.name}</p>
                      <p className="truncate text-xs text-slate-500">{student.email} · {student.classNames.join(', ')}</p>
                      {student.badges.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{student.badges.map((b) => <span key={b.badge.id} className="eg-badge eg-badge-amber">{b.badge.name}</span>)}</div>}
                    </div>
                    {student.cvUrl ? <a href={`/api/student/cv?userId=${student.id}`} target="_blank" rel="noopener noreferrer" className="eg-btn eg-btn-ghost eg-btn-sm"><Icon name="exam" className="h-3.5 w-3.5" />CV</a> : <span className="text-xs text-slate-400">{t('Pas de CV')}</span>}
                    <select aria-label={`${t('Badge pour')} ${student.name}`} value={studentBadge[student.id] || ''} onChange={(e) => setStudentBadge({ ...studentBadge, [student.id]: e.target.value })} className="eg-input w-40 py-1.5 text-xs">
                      <option value="">{t('Choisir un badge')}</option>
                      {badges.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button disabled={!studentBadge[student.id]} onClick={() => awardBadge(student.id)} className="eg-btn eg-btn-sm bg-amber-500 text-white hover:bg-amber-600">{t('Attribuer')}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'certificates' && (
        <form onSubmit={issueClassCertificates} className="eg-card grid gap-5 p-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-4">
            <div><p className="eg-h2">{t('Délivrer des certificats à une classe')}</p><p className="text-sm text-slate-500">{t('Chaque étudiant inscrit et actif reçoit un certificat personnalisé à son nom.')}</p></div>
            <label className="block"><span className="eg-label">{t('Classe')}</span>
              <select required value={certificateClassId} onChange={(e) => setCertificateClassId(e.target.value)} className="eg-input">
                <option value="">{t('Choisir une classe')}</option>
                {classes.map((c) => { const n = (c.enrollments || []).filter((e) => e.status === 'APPROVED').length; return <option key={c.id} value={c.id}>{c.name} · {n} {t(n > 1 ? 'inscrits' : 'inscrit')}</option>; })}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className="eg-label">{t('Titre du certificat')}</span><input required minLength={3} maxLength={120} value={certificateTitle} onChange={(e) => setCertificateTitle(e.target.value)} className="eg-input" /></label>
              <label><span className="eg-label">{t('Délivré par')}</span><input required minLength={2} maxLength={100} value={issuerName} onChange={(e) => setIssuerName(e.target.value)} className="eg-input" /></label>
            </div>
            <label className="block"><span className="eg-label">{t('Texte de reconnaissance')}</span><textarea maxLength={260} rows={3} value={certificateDescription} onChange={(e) => setCertificateDescription(e.target.value)} className="eg-input" /></label>
            <button disabled={issuingCertificates || !certificateClassId} className="eg-btn eg-btn-primary">{issuingCertificates ? t('Délivrance…') : <><Icon name="award" className="h-4 w-4" />{t('Délivrer aux étudiants inscrits')}</>}</button>
          </div>
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-cyan-50 p-5 ring-1 ring-brand-100">
            <p className="eg-eyebrow">{t('Aperçu')}</p>
            <div className="mt-3 rounded-xl border-4 border-double border-brand-300 bg-white p-5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{certificateTitle || '—'}</p>
              <p className="mt-3 text-lg font-bold text-slate-900">{recipients[0]?.user?.name ?? t('Nom de l’étudiant')}</p>
              <p className="mt-2 line-clamp-3 text-xs text-slate-500">{certificateDescription}</p>
              <p className="mt-4 text-[11px] text-slate-400">{issuerName || '—'}</p>
            </div>
            <p className="mt-4 text-sm text-slate-600"><strong>{recipients.length}</strong> {t(recipients.length > 1 ? 'destinataires' : 'destinataire')}{recipients.length ? ` : ${recipients.map((e) => e.user?.name).filter(Boolean).join(', ')}` : ''}</p>
          </div>
        </form>
      )}
    </AppShell>
  );
}
