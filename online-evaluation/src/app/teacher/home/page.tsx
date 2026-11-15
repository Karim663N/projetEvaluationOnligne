'use client';

import { useState, useEffect } from 'react';
import type { ClassView, ExamView, QuestionView } from '@/lib/types';
import { useRoleGuard } from '@/lib/use-role-guard';
import { useLang, DynamicText, useT } from '@/lib/i18n-context';
import WorkspaceSidebar from '@/components/WorkspaceSidebar';

export default function TeacherHome() {
  useRoleGuard('TEACHER');

  // Utilisation du contexte global i18n
  const lang = useLang();
  const t = useT();

  const [exams, setExams] = useState<ExamView[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [duration, setDuration] = useState(30);
  const [passingScore, setPassingScore] = useState(60);
  const [classId, setClassId] = useState('');
  const [classes, setClasses] = useState<ClassView[]>([]);
  const [questionType, setQuestionType] = useState('SINGLE');

  // Question builder state
  const [selectedExamForQuestions, setSelectedExamForQuestions] = useState<ExamView | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [questionImageUrl, setQuestionImageUrl] = useState('');
  const [questionError, setQuestionError] = useState('');
  const [uploadingCount, setUploadingCount] = useState(0);
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState([
    { text: '', isCorrect: false, imageUrl: '' },
    { text: '', isCorrect: false, imageUrl: '' },
  ]);

  useEffect(() => {
    fetchExams();
    fetch('/api/classes').then(r => r.json()).then(data => setClasses(data.classes || [])).catch(() => {});
  }, []);

  const fetchExams = async () => {
    try {
      const res = await fetch('/api/exams');
      const data = await res.json();
      if (res.ok) setExams(data.exams || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, duration: Number(duration), passingScore: Number(passingScore), classId: classId || null }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setTitle('');
        setDescription('');
        setDuration(30);
        fetchExams();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExamForQuestions) return;
    setQuestionError('');

    try {
      const res = await fetch(`/api/exams/${selectedExamForQuestions.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: questionText,
          imageUrl: questionImageUrl,
          points: Number(points),
          questionType,
          options: questionType === 'TEXT_ESSAY' ? [] : options,
        }),
      });
      if (res.ok) {
        setQuestionText('');
        setQuestionImageUrl('');
        setPoints(1);
        setOptions([
          { text: '', isCorrect: false, imageUrl: '' },
          { text: '', isCorrect: false, imageUrl: '' },
        ]);
        const examRes = await fetch(`/api/exams/${selectedExamForQuestions.id}`);
        const examData = await examRes.json();
        if (examRes.ok) setSelectedExamForQuestions(examData.exam);
      } else {
        const data = await res.json();
        setQuestionError(data.error || 'Could not add this question');
      }
    } catch (err) {
      console.error(err);
      setQuestionError('Could not add this question. Check your connection and try again.');
    }
  };

  const uploadImage = async (file: File, onUploaded: (url: string) => void) => {
    setUploadingCount(count => count + 1);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const res = await fetch('/api/uploads/images', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Image upload failed');
      onUploaded(data.url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Image upload failed');
    } finally {
      setUploadingCount(count => Math.max(0, count - 1));
    }
  };

  const openQuestions = async (exam: ExamView) => {
    const res = await fetch(`/api/exams/${exam.id}`);
    const data = await res.json();
    if (res.ok) setSelectedExamForQuestions(data.exam);
  };

  const togglePublished = async (exam: ExamView) => {
    const res = await fetch(`/api/exams/${exam.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !exam.published }),
    });
    if (res.ok) fetchExams(); else { const data = await res.json(); alert(data.error || 'Could not update exam status'); }
  };

  return (
    <div className={`flex h-screen overflow-hidden bg-slate-50 text-slate-900 ${lang === 'ar' ? 'rtl' : 'ltr'}`} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <WorkspaceSidebar
        title="Teacher Studio"
        accent="emerald"
        items={[
          { href: '/teacher/profile', icon: '👤', label: 'Manage Profile', color: 'sky' },
          { href: '/teacher/home', icon: '📝', label: 'My Exams', color: 'emerald' },
          { href: '/teacher/classes', icon: '🏛️', label: 'My Classes', color: 'amber' },
          { href: '/teacher/grading', icon: '✍️', label: 'Grading Center', color: 'violet' },
        ]}
      />

      <main className="flex-1 p-10 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-4xl font-black text-slate-900">{t('Exam Management Studio')}</h2>
            <p className="mt-1 text-slate-500">{t('Create, configure, and publish assessments with multi-format questions.')}</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-white font-bold shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center gap-2"
          >
            <span>+</span> {t('Create New Exam')}
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400">{t('Loading exams...')}</div>
        ) : exams.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-dashed border-slate-300 bg-white text-slate-500">{t('No exams created yet. Click Create New Exam to begin.')}</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {exams.map((exam) => (
              <div key={exam.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between hover:border-emerald-300 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-2xl font-bold text-slate-900"><DynamicText text={exam.title} /></h3>
                    <span className={`px-3 py-1 text-xs font-bold rounded-full ${exam.published ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                      {exam.published ? t('Published') : t('Draft')}
                    </span>
                  </div>
                  <p className="text-slate-500 text-sm mb-4 line-clamp-2">{exam.description ? <DynamicText text={exam.description} /> : t('No description provided.')}</p>
                  <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
                    <span>⏱️ {t('Duration')}: {exam.duration} {t('min')}</span>
                    <span>❓ {t('Questions')}: {exam._count?.questions || 0}</span>
                    <span>🎯 {t('Passing')}: {exam.passingScore}%</span>
                  </div>
                </div>
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => openQuestions(exam)}
                    className="rounded-xl bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700 hover:bg-emerald-100 transition-all"
                  >
                    {t('Manage Questions')}
                  </button>
                  <button
                    onClick={() => togglePublished(exam)}
                    className={`rounded-xl px-4 py-2 text-sm font-bold transition-all ${exam.published ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-blue-600 text-white shadow-md shadow-blue-600/20 hover:bg-blue-700'}`}
                  >
                    {exam.published ? t('Unpublish') : t('Publish')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Exam Modal */}
        {showCreateModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4">
            <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-lg border border-slate-200">
              <h3 className="text-2xl font-black text-slate-900 mb-6">{t('Create New Exam')}</h3>
              <form onSubmit={handleCreateExam} className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('Exam Title')}</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                    placeholder={t('e.g., Advanced Next.js Midterm')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('Description')}</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    placeholder={t('Brief description of exam objectives...')}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('Duration (minutes)')}</label>
                    <input
                      type="number"
                      required
                      min={5}
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('Passing Score (%)')}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={passingScore}
                      onChange={(e) => setPassingScore(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('Assign to Class (optional)')}</label>
                  <select
                    value={classId}
                    onChange={e => setClassId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  >
                    <option value="">{t('Available to all students')}</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-all"
                  >
                    {t('Cancel')}
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition-all"
                  >
                    {t('Create Exam')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Manage Questions Modal */}
        {selectedExamForQuestions && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-50 p-4 overflow-y-auto">
            <div className="bg-white p-8 rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-slate-200">
              <div className="flex justify-between items-center mb-6 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="text-2xl font-black text-slate-900">{t('Manage Questions')}</h3>
                  <p className="text-sm text-slate-500">{t('Exam:')} <DynamicText text={selectedExamForQuestions.title} /></p>
                </div>
                <button
                  onClick={() => setSelectedExamForQuestions(null)}
                  className="text-slate-400 hover:text-slate-700 font-bold text-2xl p-2"
                >
                  &times;
                </button>
              </div>

              {/* Question list */}
              <div className="space-y-4 mb-8">
                <h4 className="font-bold text-slate-800 text-lg">{t('Existing Questions')} ({selectedExamForQuestions.questions?.length || 0})</h4>
                {selectedExamForQuestions.questions?.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">{t('No questions added yet.')}</p>
                ) : (
                  selectedExamForQuestions.questions?.map((q: QuestionView, idx: number) => (
                    <div key={q.id} className="border border-slate-200 p-5 rounded-2xl bg-slate-50 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <p className="font-bold text-slate-900">{idx + 1}. <DynamicText text={q.text} /></p>
                        <span className="text-xs font-bold px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-full">{q.points} {t('pts')}</span>
                      </div>
                      {q.imageUrl && <img src={q.imageUrl} alt="Question illustration" className="max-h-48 rounded-xl object-contain border border-slate-200 bg-white"/>}
                      {q.questionType !== 'TEXT_ESSAY' && (
                        <ul className="space-y-1.5 pl-2">
                          {q.options?.map((opt) => (
                            <li key={opt.id} className={`text-sm flex items-center gap-2 font-medium ${opt.isCorrect ? 'text-emerald-700 font-bold' : 'text-slate-600'}`}>
                              <span>{opt.isCorrect ? '✓' : '•'}</span> <DynamicText text={opt.text} />
                              {opt.imageUrl && <img src={opt.imageUrl} alt="Option illustration" className="ml-2 inline-block max-h-16 rounded object-contain border bg-white"/>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add Question Form */}
              <form onSubmit={handleAddQuestion} className="space-y-5 border-t border-slate-100 pt-6">
                <h4 className="font-bold text-slate-900 text-lg">{t('Add New Question')}</h4>
                {questionError && <p role="alert" className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-sm font-semibold text-rose-700"><DynamicText text={questionError} /></p>}
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('Question Text')}</label>
                  <input
                    type="text"
                    required
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                    placeholder={t('e.g., What is React Server Components?')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('Question Type')}</label>
                    <select
                      value={questionType}
                      onChange={(e) => {
                        const type = e.target.value;
                        setQuestionType(type);
                        if (type === 'BOOLEAN') setOptions([{ text: 'True', isCorrect: false, imageUrl: '' }, { text: 'False', isCorrect: false, imageUrl: '' }]);
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                    >
                      <option value="SINGLE">{t('Multiple choice (Single)')}</option>
                      <option value="MULTIPLE">{t('Multiple answers')}</option>
                      <option value="BOOLEAN">{t('True / False')}</option>
                      <option value="TEXT_ESSAY">{t('Essay / Text')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1">{t('Points')}</label>
                    <input
                      type="number"
                      required
                      min={1}
                      value={points}
                      onChange={(e) => setPoints(Number(e.target.value))}
                      className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-600 font-medium"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1">{t('Question Image (optional)')}</label>
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadImage(file, setQuestionImageUrl); e.currentTarget.value = ''; }} className="w-full rounded-xl border border-slate-300 p-2 text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" />
                  {questionImageUrl && <div className="mt-3 flex items-center gap-4"><img src={questionImageUrl} alt="Question preview" className="max-h-28 rounded-xl border object-contain bg-white"/><button type="button" onClick={() => setQuestionImageUrl('')} className="text-xs font-bold text-rose-600">{t('Remove image')}</button></div>}
                </div>

                {questionType !== 'TEXT_ESSAY' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-bold text-slate-700">{t('Options')} {questionType === 'MULTIPLE' ? t('(Select all correct answers)') : t('(Select the correct answer)')}</label>
                    {options.map((opt, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-slate-50">
                        <input
                          type={questionType === 'MULTIPLE' ? 'checkbox' : 'radio'}
                          name="correctOption"
                          checked={opt.isCorrect}
                          onChange={(e) => setOptions(options.map((o, i) => ({ ...o, isCorrect: i === index ? e.target.checked : questionType === 'MULTIPLE' ? o.isCorrect : false })))}
                          className="h-5 w-5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                        />
                        <input
                          type="text"
                          required
                          value={opt.text}
                          onChange={(e) => {
                            const newOpts = [...options];
                            newOpts[index].text = e.target.value;
                            setOptions(newOpts);
                          }}
                          className="flex-1 rounded-xl border border-slate-300 px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm font-medium"
                          placeholder={t(`Option ${index + 1}`)}
                        />
                        <label className="cursor-pointer text-xs font-bold bg-white border border-slate-200 px-3 py-2 rounded-xl text-slate-700 hover:bg-slate-50">{opt.imageUrl ? t('Change image') : t('Image')}<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={e => { const file = e.target.files?.[0]; if (file) void uploadImage(file, url => setOptions(current => current.map((o, i) => i === index ? { ...o, imageUrl: url } : o))); e.currentTarget.value = ''; }} /></label>
                        {opt.imageUrl && <img src={opt.imageUrl} alt="Option preview" className="max-h-12 max-w-16 rounded object-contain border bg-white"/>}
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => setOptions(options.filter((_, i) => i !== index))}
                            className="text-slate-400 hover:text-rose-600 font-bold p-1"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setOptions([...options, { text: '', isCorrect: false, imageUrl: '' }])}
                      className="text-sm font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      + {t('Add Option')}
                    </button>
                  </div>
                )}

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={uploadingCount > 0}
                    className="rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 disabled:opacity-50 transition-all"
                  >
                    {uploadingCount > 0 ? t('Uploading image...') : t('Add Question to Exam')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
        </div>
      </main>
    </div>
  );
}