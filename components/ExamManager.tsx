'use client';

import React, { useMemo, useState } from 'react';
import { Calendar, Plus, X } from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import type { ExaminationStatus, ExaminationType } from '@/lib/types';
import { EXAM_TYPE_LABELS } from '@/lib/types';

interface ExamManagerProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
}

export default function ExamManager({ data, onRefresh }: ExamManagerProps) {
  const canManageStatus = ['super_admin', 'exam_officer'].includes(data.me.role);
  const canCreate = ['super_admin', 'exam_officer', 'teacher'].includes(data.me.role);
  const exams = data.examinations || [];
  const questions = data.questions || [];

  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const defaultSessId =
    data.sessions.find((s) => s.isCurrent)?.id || data.sessions[0]?.id || 'sess_2026_2027';
  const defaultTermId =
    data.terms.find((t) => t.sessionId === defaultSessId && t.isCurrent)?.id ||
    data.terms.find((t) => t.sessionId === defaultSessId)?.id ||
    'term_1';

  const [title, setTitle] = useState('');
  const [sessionId, setSessionId] = useState(defaultSessId);
  const [termId, setTermId] = useState(defaultTermId);
  const [classId, setClassId] = useState(data.classes[10]?.id || data.classes[0]?.id || '');
  const [subjectId, setSubjectId] = useState(data.subjects[14]?.id || data.subjects[0]?.id || '');
  const [examType, setExamType] = useState<ExaminationType>(
    data.me.role === 'teacher' ? 'class_quiz' : 'mid_term'
  );
  const [examDate, setExamDate] = useState('2026-11-25');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [passMarkPercent, setPassMarkPercent] = useState(50);
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [status, setStatus] = useState<ExaminationStatus>('active');
  const [randomiseQuestions, setRandomiseQuestions] = useState(true);
  const [randomiseOptions, setRandomiseOptions] = useState(true);
  const [autoPublishObjectiveResults, setAutoPublishObjectiveResults] = useState(true);
  const [instructions, setInstructions] = useState(data.settings.defaultInstructions);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [autoSelectCount, setAutoSelectCount] = useState(0);
  const [autoSelectTopic, setAutoSelectTopic] = useState('');

  const eligibleApprovedQuestions = useMemo(() => {
    const allowUnapproved =
      data.me.role === 'super_admin' && data.settings.allowUnapprovedQuestionsByAdmin;
    const isTeacherOwn = data.me.role === 'teacher';
    return questions.filter(
      (q) =>
        q.subjectId === subjectId &&
        q.classId === classId &&
        (allowUnapproved ||
          q.approvalStatus === 'approved' ||
          (isTeacherOwn &&
            q.teacherProfileId === data.me.id &&
            q.approvalStatus !== 'rejected' &&
            q.approvalStatus !== 'archived'))
    );
  }, [questions, subjectId, classId, data.me.role, data.me.id, data.settings.allowUnapprovedQuestionsByAdmin]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      await apiFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          payload: {
            title,
            sessionId,
            termId,
            classId,
            subjectId,
            examType,
            examDate,
            startTime,
            endTime,
            durationMinutes,
            passMarkPercent,
            maxAttempts,
            status,
            randomiseQuestions,
            randomiseOptions,
            autoPublishObjectiveResults,
            instructions,
            questionIds: selectedQuestionIds,
            autoSelectCount,
            autoSelectTopic,
          },
        }),
      });
      setFeedback(`Examination "${title}" created and assigned.`);
      setTitle('');
      setSelectedQuestionIds([]);
      setShowCreate(false);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create examination.');
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (examId: string, nextStatus: ExaminationStatus) => {
    setError(null);
    try {
      await apiFetch('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update_status',
          payload: { examId, status: nextStatus },
        }),
      });
      setFeedback(`Examination status updated to ${nextStatus}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div>
          <h2 className="font-display text-lg font-bold text-[#1E103D]">
            Examination Creation &amp; Scheduling
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {exams.length} examination{exams.length === 1 ? '' : 's'} configured across academic sessions and terms
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="px-4 py-2 text-xs font-bold bg-gradient-to-r from-[#4C1D95] to-[#0A1E3D] hover:from-[#5B21B6] hover:to-[#132E59] text-white rounded-lg flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4 text-[#FACC15]" />
            <span>Create Examination</span>
          </button>
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

      {showCreate && (
        <form
          onSubmit={handleCreateExam}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <h3 className="font-display text-base font-bold text-slate-900">
              Configure New Examination
            </h3>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              aria-label="Close exam form"
              className="text-slate-500 hover:text-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="sm:col-span-2 lg:col-span-1">
              <label htmlFor="ex-title" className="block text-xs font-medium text-slate-700 mb-1">
                Examination Title
              </label>
              <input
                id="ex-title"
                type="text"
                required
                placeholder="e.g. SSS 2 First Term Chemistry Test"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg"
              />
            </div>

            <div>
              <label htmlFor="ex-session" className="block text-xs font-medium text-slate-700 mb-1">
                Academic Session
              </label>
              <select
                id="ex-session"
                value={sessionId}
                onChange={(e) => {
                  const next = e.target.value;
                  setSessionId(next);
                  const first = data.terms.find((t) => t.sessionId === next);
                  if (first) setTermId(first.id);
                }}
                className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
              >
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ex-term" className="block text-xs font-medium text-slate-700 mb-1">
                Term / Semester
              </label>
              <select
                id="ex-term"
                value={termId}
                onChange={(e) => setTermId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
              >
                {data.terms
                  .filter((t) => t.sessionId === sessionId)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label htmlFor="ex-class" className="block text-xs font-medium text-slate-700 mb-1">
                Class
              </label>
              <select
                id="ex-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
              >
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ex-sub" className="block text-xs font-medium text-slate-700 mb-1">
                Subject
              </label>
              <select
                id="ex-sub"
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setSelectedQuestionIds([]);
                }}
                className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
              >
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ex-type" className="block text-xs font-medium text-slate-700 mb-1">
                Examination Type
              </label>
              <select
                id="ex-type"
                value={examType}
                onChange={(e) => setExamType(e.target.value as ExaminationType)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {(Object.keys(EXAM_TYPE_LABELS) as ExaminationType[]).map((t) => (
                  <option key={t} value={t}>
                    {EXAM_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="ex-date" className="block text-xs font-medium text-slate-700 mb-1">
                Examination Date
              </label>
              <input
                id="ex-date"
                type="date"
                required
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ex-start" className="block text-xs font-medium text-slate-700 mb-1">
                  Start
                </label>
                <input
                  id="ex-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ex-end" className="block text-xs font-medium text-slate-700 mb-1">
                  End
                </label>
                <input
                  id="ex-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="ex-dur" className="block text-xs font-medium text-slate-700 mb-1">
                  Duration (m)
                </label>
                <input
                  id="ex-dur"
                  type="number"
                  min={5}
                  max={240}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ex-pass" className="block text-xs font-medium text-slate-700 mb-1">
                  Pass %
                </label>
                <input
                  id="ex-pass"
                  type="number"
                  min={1}
                  max={100}
                  value={passMarkPercent}
                  onChange={(e) => setPassMarkPercent(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label htmlFor="ex-att" className="block text-xs font-medium text-slate-700 mb-1">
                  Max Attempts
                </label>
                <input
                  id="ex-att"
                  type="number"
                  min={1}
                  max={10}
                  value={maxAttempts}
                  onChange={(e) => setMaxAttempts(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ex-status" className="block text-xs font-medium text-slate-700 mb-1">
                Initial Status
              </label>
              <select
                id="ex-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ExaminationStatus)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="active">Active (Open Now)</option>
                <option value="scheduled">Scheduled (Future)</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          {/* Question Paper Assembly */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-900">
                Select Approved Questions ({eligibleApprovedQuestions.length} available in subject bank)
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Optional topic filter"
                  value={autoSelectTopic}
                  onChange={(e) => setAutoSelectTopic(e.target.value)}
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="Auto count"
                  value={autoSelectCount || ''}
                  onChange={(e) => setAutoSelectCount(Number(e.target.value))}
                  className="w-24 px-2.5 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                />
              </div>
            </div>

            {eligibleApprovedQuestions.length === 0 ? (
              <p className="text-xs text-amber-800">
                No approved questions found for this subject yet. Approve questions in the Question Bank first.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-200 bg-white border border-slate-200 rounded-lg">
                {eligibleApprovedQuestions.map((q) => {
                  const checked = selectedQuestionIds.includes(q.id);
                  return (
                    <label
                      key={q.id}
                      className="flex items-start gap-3 p-3 text-xs cursor-pointer hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSelectedQuestionIds((prev) =>
                            e.target.checked
                              ? [...prev, q.id]
                              : prev.filter((id) => id !== q.id)
                          );
                        }}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-slate-900">{q.questionText}</div>
                        <div className="text-slate-500 mt-0.5">
                          {q.topic} · {q.difficulty} · {q.marks} marks
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={randomiseQuestions}
                onChange={(e) => setRandomiseQuestions(e.target.checked)}
              />
              <span>Randomise Question Order</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={randomiseOptions}
                onChange={(e) => setRandomiseOptions(e.target.checked)}
              />
              <span>Randomise Answer Options</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPublishObjectiveResults}
                onChange={(e) => setAutoPublishObjectiveResults(e.target.checked)}
              />
              <span>Auto-publish objective-only results upon submission</span>
            </label>
          </div>

          <div>
            <label htmlFor="ex-inst" className="block text-xs font-medium text-slate-700 mb-1">
              Examination Instructions
            </label>
            <textarea
              id="ex-inst"
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-2.5 bg-[#0A1E3D] text-white text-sm font-semibold rounded-lg"
            >
              {busy ? 'Creating Examination...' : 'Save & Schedule Examination'}
            </button>
          </div>
        </form>
      )}

      {/* Examinations Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Examination Title</th>
                <th className="py-3 px-4">Class & Subject</th>
                <th className="py-3 px-4">Schedule</th>
                <th className="py-3 px-4 text-right">Duration</th>
                <th className="py-3 px-4 text-right">Questions / Marks</th>
                <th className="py-3 px-4">Status</th>
                {canManageStatus && <th className="py-3 px-4 text-right">Controls</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {exams.map((ex) => {
                const cls = data.classes.find((c) => c.id === ex.classId);
                const sub = data.subjects.find((s) => s.id === ex.subjectId);
                const sess = data.sessions.find((s) => s.id === ex.sessionId);
                const term = data.terms.find((t) => t.id === ex.termId);
                return (
                  <tr key={ex.id} className="hover:bg-purple-50/40">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{ex.title}</div>
                      <div className="text-xs text-[#4C1D95] font-medium">
                        {EXAM_TYPE_LABELS[ex.examType]} · {sess?.name || 'Active Session'} · {term?.name || 'Term'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-700">
                      <div className="font-medium text-slate-900">{cls?.name}</div>
                      <div>{sub?.name}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono-tabular text-slate-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{ex.examDate}</span>
                      </div>
                      <div>
                        {ex.startTime}–{ex.endTime}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-slate-800">
                      {ex.durationMinutes} min
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-slate-800">
                      {ex.questionCount} Qs · {ex.totalMarks} pts
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold">
                      <span
                        className={
                          ex.status === 'active'
                            ? 'text-emerald-700'
                            : ex.status === 'closed'
                              ? 'text-slate-500'
                              : 'text-amber-700'
                        }
                      >
                        {ex.status.toUpperCase()}
                      </span>
                    </td>
                    {canManageStatus && (
                      <td className="py-3.5 px-4 text-right">
                        <select
                          aria-label={`Change status for ${ex.title}`}
                          value={ex.status}
                          onChange={(e) =>
                            void handleStatusChange(ex.id, e.target.value as ExaminationStatus)
                          }
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          <option value="draft">Draft</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="active">Active</option>
                          <option value="rescheduled">Rescheduled</option>
                          <option value="closed">Closed</option>
                        </select>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
