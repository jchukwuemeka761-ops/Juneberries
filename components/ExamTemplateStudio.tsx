'use client';

import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  FileUp,
  Layers,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import {
  type DocumentParseResult,
  generateSampleTemplateDocument,
  parseExamDocumentText,
} from '@/lib/document-parser';
import { downloadExamTemplatePdf, extractTextFromUploadedFile } from '@/lib/pdf-tools';
import {
  type DifficultyLevel,
  EXAM_TEMPLATE_LABELS,
  EXAM_TYPE_LABELS,
  type ExamTemplateType,
  type ExaminationType,
} from '@/lib/types';

interface ExamTemplateStudioProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
  initialClassId?: string;
  initialSubjectId?: string;
}

const TEMPLATE_HINTS: Record<ExamTemplateType, string> = {
  mcq_4: 'Standard 4-option A, B, C, D questions with inline "Answer: B" or a bottom "ANSWER KEY:" section.',
  mcq_2_ab: 'Two-choice A / B questions ideal for rapid binary comprehension checks and primary/junior tests.',
  true_false: 'True or False statements where students pick True or False on the CBT runner.',
  fill_in_gap: 'Fill-in-the-blank prompts (e.g., "... is ____.") supporting pipe-separated alternatives like "Water | H2O".',
  mixed: 'Automatically detects 4-option MCQ, 2-option A–B, True/False, and Fill-in-the-Blank items in one upload.',
};

export default function ExamTemplateStudio({
  data,
  onRefresh,
  initialClassId,
  initialSubjectId,
}: ExamTemplateStudioProps) {
  const isTeacher = data.me.role === 'teacher';
  const myAssignments = useMemo(
    () => (isTeacher ? data.teacherAssignments || [] : []),
    [isTeacher, data.teacherAssignments]
  );

  const formClasses = useMemo(() => {
    if (isTeacher && myAssignments.length > 0) {
      const ids = new Set(myAssignments.map((a) => a.classId));
      return data.classes.filter((c) => ids.has(c.id));
    }
    return data.classes;
  }, [isTeacher, myAssignments, data.classes]);

  const defaultClsId = initialClassId || formClasses[0]?.id || data.classes[0]?.id || '';

  const getSubjectsForClass = (clsId: string) => {
    if (isTeacher && myAssignments.length > 0) {
      const subIds = new Set(
        myAssignments.filter((a) => a.classId === clsId).map((a) => a.subjectId)
      );
      const list = data.subjects.filter((s) => subIds.has(s.id));
      return list.length > 0 ? list : data.subjects;
    }
    const filtered = data.subjects.filter(
      (s) => s.applicableClassIds.length === 0 || s.applicableClassIds.includes(clsId)
    );
    return filtered.length > 0 ? filtered : data.subjects;
  };

  const defaultSubId =
    initialSubjectId || getSubjectsForClass(defaultClsId)[0]?.id || data.subjects[0]?.id || '';

  const currentSession = data.sessions.find((s) => s.isCurrent) || data.sessions[0];
  const [classId, setClassId] = useState(defaultClsId);
  const [subjectId, setSubjectId] = useState(defaultSubId);
  const [sessionId, setSessionId] = useState(currentSession?.id || 'sess_2026_2027');

  const sessionTerms = useMemo(
    () => data.terms.filter((t) => t.sessionId === sessionId),
    [data.terms, sessionId]
  );
  const [termId, setTermId] = useState(
    data.terms.find((t) => t.sessionId === (currentSession?.id || 'sess_2026_2027') && t.isCurrent)
      ?.id ||
      sessionTerms[0]?.id ||
      'term_1'
  );

  const [template, setTemplate] = useState<ExamTemplateType>('mcq_4');
  const [defaultTopic, setDefaultTopic] = useState('Terminal Assessment');
  const [defaultMarks, setDefaultMarks] = useState(2);
  const [defaultDifficulty, setDefaultDifficulty] = useState<DifficultyLevel>('medium');

  const [rawText, setRawText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<DocumentParseResult | null>(null);
  const [extracting, setExtracting] = useState(false);

  // Publish immediately as Auto-Marked Live CBT Exam
  const [publishExamNow, setPublishExamNow] = useState(true);
  const [examTitle, setExamTitle] = useState('');
  const [examType, setExamType] = useState<ExaminationType>('continuous_assessment');
  const [durationMinutes, setDurationMinutes] = useState(40);
  const [passMarkPercent, setPassMarkPercent] = useState(50);
  const [examDate, setExamDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoPublishResults, setAutoPublishResults] = useState(true);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const validSubjects = useMemo(
    () => getSubjectsForClass(classId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classId, data.subjects, isTeacher, myAssignments]
  );

  const selectedClass = data.classes.find((c) => c.id === classId);
  const selectedSubject = data.subjects.find((s) => s.id === subjectId);
  const selectedSession = data.sessions.find((s) => s.id === sessionId);
  const selectedTerm = data.terms.find((t) => t.id === termId);

  const suggestedTitle = `${selectedClass?.name || ''} ${selectedSubject?.name || ''} (${selectedTerm?.name || ''} · ${selectedSession?.name || ''})`.trim();

  const runParse = (sourceText: string, activeTemplate: ExamTemplateType = template) => {
    setError(null);
    const parsed = parseExamDocumentText({
      rawText: sourceText,
      template: activeTemplate,
      defaultTopic,
      defaultMarks,
      defaultDifficulty,
    });
    setParseResult(parsed);
    if (!examTitle.trim() && parsed.questions.length > 0) {
      setExamTitle(suggestedTitle);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFeedback(null);
    setExtracting(true);
    setUploadedFileName(file.name);
    try {
      const extracted = await extractTextFromUploadedFile(file);
      setRawText(extracted);
      runParse(extracted);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not extract readable text from the uploaded PDF or document.'
      );
    } finally {
      setExtracting(false);
    }
  };

  const handleLoadSampleIntoEditor = (count: number) => {
    const sample = generateSampleTemplateDocument(
      template,
      selectedSubject?.name || 'Subject',
      count
    );
    setUploadedFileName(`Sample_${template}_${count}Q.txt`);
    setRawText(sample);
    runParse(sample);
  };

  const handleSaveBatch = async (publishCbt: boolean) => {
    if (!parseResult || parseResult.questions.length === 0) {
      setError('Parse at least one valid question with an answer key before saving.');
      return;
    }
    const finalTitle = examTitle.trim() || suggestedTitle;
    if (publishCbt && !finalTitle) {
      setError('Provide an examination title before publishing.');
      return;
    }

    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ importedCount: number; createdExamId: string | null }>(
        '/api/questions',
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'batch_document_import',
            payload: {
              subjectId,
              classId,
              sessionId,
              termId,
              questions: parseResult.questions,
              submitForApproval: true,
              examConfig: publishCbt
                ? {
                    createExam: true,
                    title: finalTitle,
                    examType,
                    examDate,
                    durationMinutes,
                    passMarkPercent,
                    autoPublishObjectiveResults: autoPublishResults,
                    randomiseQuestions: true,
                    randomiseOptions: true,
                  }
                : null,
            },
          }),
        }
      );

      setFeedback(
        res.createdExamId
          ? `Saved ${res.importedCount} questions & answer keys and published live auto-marked CBT exam "${finalTitle}". Students in ${selectedClass?.name} can take it immediately.`
          : `Saved ${res.importedCount} questions & answer keys into ${selectedClass?.name} · ${selectedSubject?.name} (${selectedSession?.name} · ${selectedTerm?.name}).`
      );
      setRawText('');
      setParseResult(null);
      setUploadedFileName(null);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save template batch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-5 sm:p-6 space-y-5 shadow-lg">
      {/* Studio Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-purple-100 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5B21B6]">
            <Sparkles className="w-3.5 h-3.5 text-[#D97706]" />
            <span>Designated CBT Exam Template &amp; PDF Auto-Marker</span>
          </div>
          <h3 className="font-display text-lg font-bold text-[#1E103D]">
            Bulk PDF / Document Question &amp; Answer Key Studio
          </h3>
          <p className="text-xs text-slate-600 max-w-2xl">
            Pick your academic session (2020/2021–2028/2029), term, class, subject, and CBT template format. Upload a formatted PDF or document (even 50+ questions)—answers are automatically saved and marked by the CBT engine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              downloadExamTemplatePdf(template, selectedSubject?.name || 'Subject', 10)
            }
            className="px-3 py-2 text-xs font-semibold rounded-lg border border-purple-300 text-[#4C1D95] bg-purple-50 hover:bg-purple-100 inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download 10-Q PDF Template</span>
          </button>
          <button
            type="button"
            onClick={() =>
              downloadExamTemplatePdf(template, selectedSubject?.name || 'Subject', 50)
            }
            className="px-3 py-2 text-xs font-bold rounded-lg bg-[#FACC15] hover:bg-[#EAB308] text-[#1E103D] inline-flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download 50-Q PDF Template</span>
          </button>
        </div>
      </div>

      {/* Step 1: Session, Term, Class, Subject & Template Picker */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div>
          <label htmlFor="tpl-session" className="block text-xs font-semibold text-[#1E103D] mb-1">
            Academic Session
          </label>
          <select
            id="tpl-session"
            value={sessionId}
            onChange={(e) => {
              const nextSess = e.target.value;
              setSessionId(nextSess);
              const firstTerm = data.terms.find((t) => t.sessionId === nextSess);
              if (firstTerm) setTermId(firstTerm.id);
            }}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
          >
            {data.sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} {s.isCurrent ? '(Active)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tpl-term" className="block text-xs font-semibold text-[#1E103D] mb-1">
            Term / Semester
          </label>
          <select
            id="tpl-term"
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
          >
            {sessionTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tpl-class" className="block text-xs font-semibold text-[#1E103D] mb-1">
            Target Class
          </label>
          <select
            id="tpl-class"
            value={classId}
            onChange={(e) => {
              const nextCls = e.target.value;
              setClassId(nextCls);
              const subs = getSubjectsForClass(nextCls);
              if (subs.length > 0 && !subs.some((s) => s.id === subjectId)) {
                setSubjectId(subs[0].id);
              }
            }}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
          >
            {formClasses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="tpl-subject" className="block text-xs font-semibold text-[#1E103D] mb-1">
            Designated Subject
          </label>
          <select
            id="tpl-subject"
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
          >
            {validSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 2: Designated Exam Template Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#1E103D] flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#5B21B6]" />
            <span>Select CBT Question Format Template</span>
          </span>
          <span className="text-[11px] text-slate-500">{TEMPLATE_HINTS[template]}</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {(Object.keys(EXAM_TEMPLATE_LABELS) as ExamTemplateType[]).map((tplKey) => {
            const active = template === tplKey;
            return (
              <button
                key={tplKey}
                type="button"
                onClick={() => {
                  setTemplate(tplKey);
                  if (rawText.trim()) runParse(rawText, tplKey);
                }}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  active
                    ? 'bg-gradient-to-r from-[#4C1D95] to-[#0A1E3D] text-white border-[#4C1D95] shadow-md'
                    : 'bg-purple-50/60 hover:bg-purple-100/70 text-[#1E103D] border-purple-200'
                }`}
              >
                <div>{EXAM_TEMPLATE_LABELS[tplKey]}</div>
                <div
                  className={`text-[10px] mt-0.5 font-normal ${
                    active ? 'text-[#FDE047]' : 'text-slate-500'
                  }`}
                >
                  {tplKey === 'mcq_4'
                    ? 'Options A, B, C, D'
                    : tplKey === 'mcq_2_ab'
                      ? 'Options A or B'
                      : tplKey === 'true_false'
                        ? 'True / False'
                        : tplKey === 'fill_in_gap'
                          ? 'Blank Space Gap'
                          : 'Smart Auto-Detect'}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Topic, Marks, Difficulty */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div>
          <label htmlFor="tpl-topic" className="block text-xs font-semibold text-slate-700 mb-1">
            Default Curriculum Topic
          </label>
          <input
            id="tpl-topic"
            type="text"
            value={defaultTopic}
            onChange={(e) => setDefaultTopic(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
          />
        </div>
        <div>
          <label htmlFor="tpl-marks" className="block text-xs font-semibold text-slate-700 mb-1">
            Marks Per Question
          </label>
          <input
            id="tpl-marks"
            type="number"
            min={1}
            max={50}
            value={defaultMarks}
            onChange={(e) => setDefaultMarks(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm font-mono-tabular border border-purple-200 rounded-lg bg-white"
          />
        </div>
        <div>
          <label htmlFor="tpl-diff" className="block text-xs font-semibold text-slate-700 mb-1">
            Difficulty Level
          </label>
          <select
            id="tpl-diff"
            value={defaultDifficulty}
            onChange={(e) => setDefaultDifficulty(e.target.value as DifficultyLevel)}
            className="w-full px-3 py-2 text-sm border border-purple-200 rounded-lg bg-white"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </div>

      {/* Step 3: PDF / Document File Upload & Live Text Editor */}
      <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="tpl-file-upload"
              className="cursor-pointer px-4 py-2 rounded-lg bg-[#4C1D95] hover:bg-[#5B21B6] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
            >
              <FileUp className="w-4 h-4 text-[#FDE047]" />
              <span>{extracting ? 'Extracting PDF...' : 'Upload PDF / TXT Exam File'}</span>
            </label>
            <input
              id="tpl-file-upload"
              type="file"
              accept=".pdf,.txt,.csv,application/pdf,text/plain"
              onChange={(e) => void handleFileUpload(e)}
              className="sr-only"
            />
            {uploadedFileName && (
              <span className="text-xs font-medium text-[#4C1D95] font-mono-tabular">
                Loaded: {uploadedFileName}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleLoadSampleIntoEditor(5)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-purple-300 bg-white text-[#4C1D95] hover:bg-purple-50"
            >
              Insert 5-Q Sample
            </button>
            <button
              type="button"
              onClick={() => handleLoadSampleIntoEditor(50)}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-purple-300 bg-white text-[#4C1D95] hover:bg-purple-50"
            >
              Insert 50-Q Bulk Sample
            </button>
          </div>
        </div>

        <textarea
          aria-label="Exam questions and answer keys text"
          rows={7}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`Paste or upload a PDF/document formatted like:\n1. What is the chemical symbol for Water?\nA. H2O   B. CO2   C. NaCl   D. O2\nAnswer: A\n\nOr include an ANSWER KEY: section at the bottom of your PDF!`}
          className="w-full px-3.5 py-2.5 text-xs font-mono-tabular border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-slate-600">
            Supports inline <code className="font-mono-tabular font-semibold">Answer: B</code> or a separate{' '}
            <code className="font-mono-tabular font-semibold">ANSWER KEY:</code> table at the end of your PDF.
          </span>
          <button
            type="button"
            disabled={!rawText.trim() || extracting}
            onClick={() => runParse(rawText)}
            className="px-4 py-2 text-xs font-bold rounded-lg bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white inline-flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5 text-[#FACC15]" />
            <span>Parse &amp; Verify Questions + Answers</span>
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
          {error}
        </div>
      )}
      {feedback && (
        <div role="status" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <span>{feedback}</span>
        </div>
      )}

      {/* Step 4: Live Parsed Questions & Answer Keys Preview + Publish Controls */}
      {parseResult && (
        <div className="space-y-4 border-t border-purple-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1E103D] text-white rounded-xl p-4">
            <div className="space-y-0.5">
              <div className="text-sm font-bold flex items-center gap-2">
                <span>
                  {parseResult.questions.length} Questions &amp; Answer Keys Ready for Auto-Marking
                </span>
              </div>
              <div className="text-xs text-purple-200">
                Template: {EXAM_TEMPLATE_LABELS[template]} · Total Marks:{' '}
                <span className="font-mono-tabular text-[#FDE047] font-bold">
                  {parseResult.questions.reduce((acc, q) => acc + q.marks, 0)} pts
                </span>
                {parseResult.issues.length > 0 && (
                  <span className="text-amber-300 ml-2">
                    · {parseResult.issues.length} item(s) skipped
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs font-mono-tabular text-[#FDE047] font-semibold">
              {selectedSession?.name} · {selectedTerm?.name}
            </div>
          </div>

          {parseResult.issues.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold">Skipped / Needs Attention ({parseResult.issues.length}):</div>
              {parseResult.issues.slice(0, 5).map((iss, idx) => (
                <div key={idx}>
                  Q{iss.index}: {iss.message}
                </div>
              ))}
            </div>
          )}

          {parseResult.questions.length > 0 && (
            <>
              <div className="max-h-64 overflow-y-auto divide-y divide-purple-100 border border-purple-200 rounded-xl bg-white">
                {parseResult.questions.slice(0, 60).map((pq) => (
                  <div key={pq.index} className="p-3.5 text-xs space-y-1.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold text-slate-900">
                        <span className="font-mono-tabular text-[#5B21B6] mr-1.5">#{pq.index}.</span>
                        {pq.questionText}
                      </div>
                      <span className="shrink-0 font-mono-tabular font-bold px-2 py-0.5 rounded bg-[#FACC15]/30 text-[#1E103D]">
                        Key: {pq.correctAnswer}
                      </span>
                    </div>
                    {pq.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600 pl-4">
                        {pq.options.map((opt) => (
                          <div
                            key={opt.id}
                            className={
                              opt.id === pq.correctAnswer
                                ? 'font-bold text-[#4C1D95]'
                                : undefined
                            }
                          >
                            {opt.label}. {opt.text}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Direct CBT Auto-Marked Publication Config */}
              <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/50 space-y-3">
                <label className="flex items-center gap-2 text-xs font-bold text-[#1E103D] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publishExamNow}
                    onChange={(e) => setPublishExamNow(e.target.checked)}
                  />
                  <span>
                    Automatically create &amp; activate an Auto-Marked CBT Examination from these{' '}
                    {parseResult.questions.length} questions
                  </span>
                </label>

                {publishExamNow && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        CBT Exam / Test Title
                      </label>
                      <input
                        type="text"
                        value={examTitle}
                        onChange={(e) => setExamTitle(e.target.value)}
                        placeholder={suggestedTitle}
                        className="w-full px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Assessment Type
                      </label>
                      <select
                        value={examType}
                        onChange={(e) => setExamType(e.target.value as ExaminationType)}
                        className="w-full px-2.5 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
                      >
                        {(Object.keys(EXAM_TYPE_LABELS) as ExaminationType[]).map((et) => (
                          <option key={et} value={et}>
                            {EXAM_TYPE_LABELS[et]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Duration (mins)
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={240}
                        value={durationMinutes}
                        onChange={(e) => setDurationMinutes(Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular border border-purple-200 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Exam Date
                      </label>
                      <input
                        type="date"
                        value={examDate}
                        onChange={(e) => setExamDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-mono-tabular border border-purple-200 rounded-lg bg-white"
                      />
                    </div>
                    <div className="sm:col-span-5 flex flex-wrap items-center justify-between gap-3 pt-1">
                      <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoPublishResults}
                          onChange={(e) => setAutoPublishResults(e.target.checked)}
                        />
                        <span>
                          Auto-mark &amp; release score immediately to student Result Checker on submission
                        </span>
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-600">Pass %:</span>
                        <input
                          type="number"
                          min={1}
                          max={100}
                          value={passMarkPercent}
                          onChange={(e) => setPassMarkPercent(Number(e.target.value))}
                          className="w-16 px-2 py-1 font-mono-tabular border border-purple-200 rounded bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveBatch(false)}
                  className="px-4 py-2.5 text-xs font-semibold rounded-lg border border-purple-300 text-[#4C1D95] bg-white hover:bg-purple-50"
                >
                  Save to Question Bank Only
                </button>
                {publishExamNow && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveBatch(true)}
                    className="px-5 py-2.5 text-xs font-bold rounded-lg bg-gradient-to-r from-[#4C1D95] to-[#0A1E3D] hover:from-[#5B21B6] hover:to-[#132E59] text-white inline-flex items-center gap-2 shadow-md"
                  >
                    <Upload className="w-4 h-4 text-[#FACC15]" />
                    <span>
                      {saving
                        ? 'Saving & Publishing...'
                        : `Save ${parseResult.questions.length} Qs & Launch Auto-Marked CBT Exam`}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
