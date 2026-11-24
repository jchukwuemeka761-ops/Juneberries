'use client';

import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Download,
  FileSpreadsheet,
  Layers,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { QUESTION_CSV_TEMPLATE, type BulkImportReport } from '@/lib/bulk-import';
import type { DifficultyLevel, QuestionApprovalStatus, QuestionType } from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';

interface QuestionBankManagerProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
  openUploadByDefault?: boolean;
}

export default function QuestionBankManager({
  data,
  onRefresh,
  openUploadByDefault = false,
}: QuestionBankManagerProps) {
  const canReview = ['super_admin', 'exam_officer', 'hod'].includes(data.me.role);
  const isSuperAdmin = data.me.role === 'super_admin';
  const isTeacher = data.me.role === 'teacher';
  const questions = data.questions || [];

  const myAssignments = useMemo(() => {
    if (!isTeacher || !data.teacherAssignments) return [];
    return data.teacherAssignments;
  }, [isTeacher, data.teacherAssignments]);

  const assignedClassIds = useMemo(
    () => new Set(myAssignments.map((a) => a.classId)),
    [myAssignments]
  );

  // Default class & subject based on teacher's first assignment or SSS 2 / first available
  const initialClassId =
    (isTeacher && myAssignments[0]?.classId) ||
    data.classes[10]?.id ||
    data.classes[0]?.id ||
    '';

  const getValidSubjectsForClass = (clsId: string) => {
    if (isTeacher && myAssignments.length > 0) {
      const assignedSubIds = new Set(
        myAssignments.filter((a) => a.classId === clsId).map((a) => a.subjectId)
      );
      return data.subjects.filter((s) => assignedSubIds.has(s.id));
    }
    return data.subjects.filter(
      (s) => s.applicableClassIds.length === 0 || s.applicableClassIds.includes(clsId)
    );
  };

  const initialSubjectsForClass = getValidSubjectsForClass(initialClassId);
  const initialSubjectId =
    (isTeacher && myAssignments[0]?.subjectId) ||
    initialSubjectsForClass[0]?.id ||
    data.subjects[0]?.id ||
    '';

  const [search, setSearch] = useState('');
  const [filterClass, setFilterClass] = useState<string>(
    isTeacher && myAssignments.length > 0 ? initialClassId : 'all'
  );
  const [filterSubject, setFilterSubject] = useState(
    isTeacher && myAssignments.length > 0 ? initialSubjectId : 'all'
  );
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  const [showCreate, setShowCreate] = useState(openUploadByDefault);
  const [showBulk, setShowBulk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Manual Question Form
  const [classId, setClassId] = useState(initialClassId);
  const [subjectId, setSubjectId] = useState(initialSubjectId);
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('medium');
  const [marks, setMarks] = useState(2);
  const [questionType, setQuestionType] = useState<QuestionType>('mcq');
  const [questionText, setQuestionText] = useState('');
  const [optA, setOptA] = useState('');
  const [optB, setOptB] = useState('');
  const [optC, setOptC] = useState('');
  const [optD, setOptD] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('A');
  const [multiCorrect, setMultiCorrect] = useState<string[]>(['A']);
  const [explanation, setExplanation] = useState('');
  const [markingGuide, setMarkingGuide] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitForApproval, setSubmitForApproval] = useState(true);
  const [autoApproveAdmin, setAutoApproveAdmin] = useState(isSuperAdmin);

  // Bulk Import State
  const [bulkClassId, setBulkClassId] = useState(initialClassId);
  const [bulkSubjectId, setBulkSubjectId] = useState(initialSubjectId);
  const [csvText, setCsvText] = useState('');
  const [bulkReport, setBulkReport] = useState<BulkImportReport | null>(null);

  const formSubjects = useMemo(() => {
    const list = getValidSubjectsForClass(classId);
    return list.length > 0 ? list : data.subjects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId, data.subjects, isTeacher, myAssignments]);

  const bulkSubjects = useMemo(() => {
    const list = getValidSubjectsForClass(bulkClassId);
    return list.length > 0 ? list : data.subjects;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkClassId, data.subjects, isTeacher, myAssignments]);

  const formClasses = useMemo(() => {
    if (isTeacher && assignedClassIds.size > 0) {
      return data.classes.filter((c) => assignedClassIds.has(c.id));
    }
    return data.classes;
  }, [isTeacher, assignedClassIds, data.classes]);

  const handleSelectWorkspaceTarget = (nextClassId: string, nextSubjectId?: string) => {
    setFilterClass(nextClassId);
    setClassId(nextClassId);
    setBulkClassId(nextClassId);

    const validForClass = getValidSubjectsForClass(nextClassId);
    const resolvedSubId =
      nextSubjectId || validForClass[0]?.id || data.subjects[0]?.id || '';
    if (resolvedSubId) {
      setFilterSubject(nextSubjectId ? resolvedSubId : 'all');
      setSubjectId(resolvedSubId);
      setBulkSubjectId(resolvedSubId);
    }
    if (!showBulk) setShowCreate(true);
  };

  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (filterClass !== 'all' && q.classId !== filterClass) return false;
      if (filterSubject !== 'all' && q.subjectId !== filterSubject) return false;
      if (filterStatus !== 'all' && q.approvalStatus !== filterStatus) return false;
      if (filterType !== 'all' && q.questionType !== filterType) return false;
      if (
        search.trim() &&
        !q.questionText.toLowerCase().includes(search.toLowerCase()) &&
        !q.topic.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [questions, filterClass, filterSubject, filterStatus, filterType, search]);

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Only PNG, JPG, or WebP diagram images are permitted.');
      return;
    }
    if (file.size > 1024 * 1024 * 2) {
      setError('Image attachment must be 2 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setImageUrl(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleCreateQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      let options = [] as Array<{ id: string; label: string; text: string }>;
      let resolvedCorrect: unknown = correctAnswer;

      if (questionType === 'mcq' || questionType === 'image_based' || questionType === 'multiple_select') {
        if (optA) options.push({ id: 'A', label: 'A', text: optA });
        if (optB) options.push({ id: 'B', label: 'B', text: optB });
        if (optC) options.push({ id: 'C', label: 'C', text: optC });
        if (optD) options.push({ id: 'D', label: 'D', text: optD });
        if (questionType === 'multiple_select') {
          resolvedCorrect = multiCorrect;
        }
      } else if (questionType === 'true_false') {
        options = [
          { id: 'True', label: 'A', text: 'True' },
          { id: 'False', label: 'B', text: 'False' },
        ];
        resolvedCorrect = correctAnswer === 'False' ? 'False' : 'True';
      }

      await apiFetch('/api/questions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          payload: {
            subjectId,
            classId,
            topic,
            difficulty,
            marks,
            questionType,
            questionText,
            options,
            correctAnswer: resolvedCorrect,
            acceptedAnswers:
              questionType === 'fill_in_gap' || questionType === 'short_answer'
                ? correctAnswer.split('|').map((s) => s.trim()).filter(Boolean)
                : undefined,
            explanation,
            markingGuide,
            imageUrl: imageUrl || undefined,
            submitForApproval,
            autoApprove: isSuperAdmin && autoApproveAdmin,
          },
        }),
      });
      const clsName = data.classes.find((c) => c.id === classId)?.name || 'selected class';
      const subName = data.subjects.find((s) => s.id === subjectId)?.name || 'selected subject';
      setFeedback(`Question uploaded successfully for ${clsName} · ${subName}.`);
      setQuestionText('');
      setTopic('');
      setOptA('');
      setOptB('');
      setOptC('');
      setOptD('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save question.');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ report: BulkImportReport }>('/api/questions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'bulk_import',
          payload: {
            subjectId: bulkSubjectId,
            classId: bulkClassId,
            csvText,
            submitForApproval: true,
            autoApprove: isSuperAdmin && autoApproveAdmin,
          },
        }),
      });
      setBulkReport(res.report);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk import failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleReviewAction = async (
    questionId: string,
    approvalStatus: QuestionApprovalStatus
  ) => {
    setError(null);
    try {
      await apiFetch('/api/questions', {
        method: 'POST',
        body: JSON.stringify({
          action: 'review',
          payload: { questionId, approvalStatus },
        }),
      });
      setFeedback(`Question marked as ${approvalStatus}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review action failed.');
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([QUESTION_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Juneberry_Question_Upload_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Question Upload Portal & Approval Bank
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {questions.length} total questions · Select any designated class below to upload or browse subject questions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setShowBulk((v) => !v);
              setShowCreate(false);
            }}
            className="px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Bulk CSV Upload</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setShowBulk(false);
            }}
            className="px-4 py-2 text-xs font-semibold bg-[#0A1E3D] hover:bg-[#132E59] text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Upload Question</span>
          </button>
        </div>
      </div>

      {/* Interactive Class & Subject Switcher */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#B8860B]" />
            <h3 className="font-display text-sm font-bold text-slate-900">
              {isTeacher
                ? 'My Designated Classes & Subjects'
                : 'Browse Classes (Primary 1 – SSS 3) to Upload Questions'}
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              setFilterClass('all');
              setFilterSubject('all');
            }}
            className={`text-xs font-semibold px-2.5 py-1 rounded border ${
              filterClass === 'all' && filterSubject === 'all'
                ? 'bg-[#0A1E3D] text-white border-[#0A1E3D]'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            View All Classes
          </button>
        </div>

        {isTeacher ? (
          myAssignments.length === 0 ? (
            <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              No classes or subjects have been assigned to your teaching profile yet. Contact the General Administrator to assign your classes.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {myAssignments.map((ta) => {
                const cls = data.classes.find((c) => c.id === ta.classId);
                const sub = data.subjects.find((s) => s.id === ta.subjectId);
                const classQs = questions.filter(
                  (q) => q.classId === ta.classId && q.subjectId === ta.subjectId
                );
                const count = classQs.length;
                const approvedCount = classQs.filter(
                  (q) => q.approvalStatus === 'approved'
                ).length;
                const active =
                  filterClass === ta.classId && filterSubject === ta.subjectId;
                return (
                  <button
                    key={ta.id}
                    type="button"
                    onClick={() => handleSelectWorkspaceTarget(ta.classId, ta.subjectId)}
                    className={`p-3.5 rounded-lg border text-left transition-colors ${
                      active
                        ? 'bg-[#0A1E3D] text-white border-[#0A1E3D]'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold">{cls?.name}</span>
                      <span
                        className={`font-mono-tabular text-xs font-semibold ${
                          active ? 'text-[#E6C567]' : 'text-[#0A1E3D]'
                        }`}
                      >
                        {count} Q{count === 1 ? '' : 's'} ({approvedCount} app.)
                      </span>
                    </div>
                    <div
                      className={`text-xs mt-1 flex items-center gap-1.5 ${
                        active ? 'text-slate-200' : 'text-slate-600'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{sub?.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {data.classes.map((cls) => {
              const count = questions.filter((q) => q.classId === cls.id).length;
              const active = filterClass === cls.id;
              return (
                <button
                  key={cls.id}
                  type="button"
                  onClick={() => handleSelectWorkspaceTarget(cls.id)}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    active
                      ? 'bg-[#0A1E3D] text-white border-[#0A1E3D]'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900'
                  }`}
                >
                  <div className="font-semibold text-xs">{cls.name}</div>
                  <div
                    className={`font-mono-tabular text-[11px] mt-0.5 ${
                      active ? 'text-[#E6C567]' : 'text-slate-500'
                    }`}
                  >
                    {count} question{count === 1 ? '' : 's'}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}
      {feedback && (
        <div role="status" className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      {/* Manual Question Editor */}
      {showCreate && (
        <form
          onSubmit={handleCreateQuestion}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Set &amp; Upload Question for{' '}
                {data.classes.find((c) => c.id === classId)?.name || 'Class'} ·{' '}
                {data.subjects.find((s) => s.id === subjectId)?.name || 'Subject'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Questions are saved strictly to this class and subject question bank.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close question editor"
              className="text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label htmlFor="q-class" className="block text-xs font-medium text-slate-700 mb-1">
                Academic Class
              </label>
              <select
                id="q-class"
                value={classId}
                onChange={(e) => {
                  const nextCls = e.target.value;
                  setClassId(nextCls);
                  const validSubs = getValidSubjectsForClass(nextCls);
                  if (validSubs.length > 0 && !validSubs.some((s) => s.id === subjectId)) {
                    setSubjectId(validSubs[0].id);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {formClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="q-subject" className="block text-xs font-medium text-slate-700 mb-1">
                Subject
              </label>
              <select
                id="q-subject"
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {formSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="q-type" className="block text-xs font-medium text-slate-700 mb-1">
                Question Format
              </label>
              <select
                id="q-type"
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as QuestionType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[])
                  .filter((t) => t !== 'matching')
                  .map((t) => (
                    <option key={t} value={t}>
                      {QUESTION_TYPE_LABELS[t]}
                    </option>
                  ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="q-diff" className="block text-xs font-medium text-slate-700 mb-1">
                  Difficulty
                </label>
                <select
                  id="q-diff"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                  className="w-full px-2.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label htmlFor="q-marks" className="block text-xs font-medium text-slate-700 mb-1">
                  Marks
                </label>
                <input
                  id="q-marks"
                  type="number"
                  min={1}
                  max={50}
                  value={marks}
                  onChange={(e) => setMarks(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="q-topic" className="block text-xs font-medium text-slate-700 mb-1">
                Curriculum Topic
              </label>
              <input
                id="q-topic"
                type="text"
                required
                placeholder="e.g. Algebraic Fractions"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="q-img" className="block text-xs font-medium text-slate-700 mb-1">
                Diagram / Image Attachment (optional)
              </label>
              <input
                id="q-img"
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-100 file:text-slate-800"
              />
            </div>
          </div>

          <div>
            <label htmlFor="q-text" className="block text-xs font-medium text-slate-700 mb-1">
              Question Stem
            </label>
            <textarea
              id="q-text"
              required
              rows={3}
              value={questionText}
              onChange={(e) => setQuestionText(e.target.value)}
              placeholder="Enter clear, unambiguous question text..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          {(questionType === 'mcq' ||
            questionType === 'image_based' ||
            questionType === 'multiple_select') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                aria-label="Option A"
                placeholder="Option A"
                required
                value={optA}
                onChange={(e) => setOptA(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                aria-label="Option B"
                placeholder="Option B"
                required
                value={optB}
                onChange={(e) => setOptB(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                aria-label="Option C"
                placeholder="Option C"
                value={optC}
                onChange={(e) => setOptC(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                aria-label="Option D"
                placeholder="Option D"
                value={optD}
                onChange={(e) => setOptD(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {questionType === 'multiple_select' ? (
              <div>
                <div className="text-xs font-medium text-slate-700 mb-1">Correct Options</div>
                <div className="flex gap-3">
                  {['A', 'B', 'C', 'D'].map((opt) => (
                    <label key={opt} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={multiCorrect.includes(opt)}
                        onChange={(e) => {
                          setMultiCorrect((prev) =>
                            e.target.checked
                              ? [...prev, opt]
                              : prev.filter((x) => x !== opt)
                          );
                        }}
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : questionType === 'true_false' ? (
              <div>
                <label htmlFor="q-tf" className="block text-xs font-medium text-slate-700 mb-1">
                  Correct Answer
                </label>
                <select
                  id="q-tf"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="True">True</option>
                  <option value="False">False</option>
                </select>
              </div>
            ) : questionType === 'mcq' || questionType === 'image_based' ? (
              <div>
                <label htmlFor="q-correct-mcq" className="block text-xs font-medium text-slate-700 mb-1">
                  Correct Option
                </label>
                <select
                  id="q-correct-mcq"
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="A">Option A</option>
                  <option value="B">Option B</option>
                  <option value="C">Option C</option>
                  <option value="D">Option D</option>
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="q-correct-text" className="block text-xs font-medium text-slate-700 mb-1">
                  Accepted Answer(s) or Key Points (separate alternatives with |)
                </label>
                <input
                  id="q-correct-text"
                  type="text"
                  required
                  value={correctAnswer}
                  onChange={(e) => setCorrectAnswer(e.target.value)}
                  placeholder="e.g. Osmosis | passive transport"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
            )}

            <div>
              <label htmlFor="q-guide" className="block text-xs font-medium text-slate-700 mb-1">
                Explanation / Marking Guide
              </label>
              <input
                id="q-guide"
                type="text"
                value={questionType === 'essay' ? markingGuide : explanation}
                onChange={(e) =>
                  questionType === 'essay'
                    ? setMarkingGuide(e.target.value)
                    : setExplanation(e.target.value)
                }
                placeholder="Examiner notes or mark breakdown..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap items-center gap-4">
              {isSuperAdmin ? (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoApproveAdmin}
                    onChange={(e) => setAutoApproveAdmin(e.target.checked)}
                  />
                  <span>Approve immediately for examinations</span>
                </label>
              ) : (
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={submitForApproval}
                    onChange={(e) => setSubmitForApproval(e.target.checked)}
                  />
                  <span>Submit immediately for HOD / Administrator approval</span>
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={busy || (isTeacher && myAssignments.length === 0)}
              className="px-5 py-2 bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {busy ? 'Uploading...' : 'Upload & Save Question'}
            </button>
          </div>
        </form>
      )}

      {/* Bulk CSV Upload Panel */}
      {showBulk && (
        <form
          onSubmit={handleBulkUpload}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900">
                Bulk Question CSV / Spreadsheet Import
              </h3>
              <p className="text-xs text-slate-500">
                Validates duplicates, missing fields, and invalid answer options before importing.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg text-slate-800 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download CSV Template</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bulk-cls" className="block text-xs font-medium text-slate-700 mb-1">
                Target Class
              </label>
              <select
                id="bulk-cls"
                value={bulkClassId}
                onChange={(e) => {
                  const nextCls = e.target.value;
                  setBulkClassId(nextCls);
                  const validSubs = getValidSubjectsForClass(nextCls);
                  if (validSubs.length > 0 && !validSubs.some((s) => s.id === bulkSubjectId)) {
                    setBulkSubjectId(validSubs[0].id);
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {formClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bulk-sub" className="block text-xs font-medium text-slate-700 mb-1">
                Target Subject
              </label>
              <select
                id="bulk-sub"
                value={bulkSubjectId}
                onChange={(e) => setBulkSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {bulkSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="bulk-csv-file" className="block text-xs font-medium text-slate-700 mb-1">
              Upload CSV File or Paste Rows Below
            </label>
            <input
              id="bulk-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                file.text().then(setCsvText);
              }}
              className="mb-2 text-xs text-slate-600"
            />
            <textarea
              rows={5}
              required
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={QUESTION_CSV_TEMPLATE}
              className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCsvText(QUESTION_CSV_TEMPLATE)}
              className="px-3.5 py-2 text-xs font-medium border border-slate-300 rounded-lg"
            >
              Load Sample Rows
            </button>
            <button
              type="submit"
              disabled={busy || (isTeacher && myAssignments.length === 0)}
              className="px-4 py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{busy ? 'Validating & Importing...' : 'Validate & Import Questions'}</span>
            </button>
          </div>

          {bulkReport && (
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="font-semibold text-slate-900">
                Import Report: {bulkReport.successful.length} imported · {bulkReport.failed.length} rejected ({bulkReport.duplicatesCount} duplicate, {bulkReport.missingFieldsCount} missing fields, {bulkReport.invalidOptionsCount} invalid options)
              </div>
              {bulkReport.failed.length > 0 && (
                <ul className="space-y-1 text-red-700">
                  {bulkReport.failed.map((f, idx) => (
                    <li key={idx}>
                      Row {f.rowNumber}: {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="search"
            aria-label="Search questions"
            placeholder="Search by question stem or topic..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg"
          />
        </div>
        <select
          aria-label="Filter by class"
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Classes</option>
          {data.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by subject"
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Subjects</option>
          {data.subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by type"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Formats</option>
          {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by approval status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Question Bank List */}
      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {filteredQuestions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No questions match your active filters. Use &ldquo;Upload Question&rdquo; above to add questions for this class and subject.
          </div>
        ) : (
          filteredQuestions.map((q) => {
            const sub = data.subjects.find((s) => s.id === q.subjectId);
            const cls = data.classes.find((c) => c.id === q.classId);
            const author = data.profiles?.find((p) => p.id === q.teacherProfileId);
            return (
              <div key={q.id} className="p-5 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#0A1E3D]">{cls?.name}</span>
                    <span>·</span>
                    <span className="font-semibold text-slate-800">{sub?.name}</span>
                    <span>·</span>
                    <span>{QUESTION_TYPE_LABELS[q.questionType]}</span>
                    <span>·</span>
                    <span>{q.topic}</span>
                    <span>·</span>
                    <span className="font-mono-tabular">{q.marks} mark{q.marks === 1 ? '' : 's'}</span>
                    <span>·</span>
                    <span
                      className={`font-semibold ${
                        q.approvalStatus === 'approved'
                          ? 'text-emerald-700'
                          : q.approvalStatus === 'rejected'
                            ? 'text-red-700'
                            : 'text-amber-700'
                      }`}
                    >
                      {q.approvalStatus.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{q.questionText}</p>
                  <div className="text-xs text-slate-500">
                    Author: {author?.fullName || 'Staff'} · Answer Key:{' '}
                    <span className="font-mono-tabular text-slate-700">
                      {typeof q.correctAnswer === 'string'
                        ? q.correctAnswer
                        : JSON.stringify(q.correctAnswer)}
                    </span>
                  </div>
                </div>

                {canReview && q.approvalStatus !== 'approved' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleReviewAction(q.id, 'approved')}
                      className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Approve</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReviewAction(q.id, 'rejected')}
                      className="px-3 py-1.5 text-xs font-semibold border border-red-300 text-red-700 hover:bg-red-50 rounded-lg"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
