'use client';

import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Download, FileText, Lock, Printer, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import {
  buildResultsExportRows,
  downloadStudentResultPdf,
  downloadSummaryReportPdf,
  exportRowsToCsv,
  exportRowsToExcel,
} from '@/lib/exports';
import type { ExaminationResult, ResultStatus } from '@/lib/types';
import ResultCheckerPanel from './ResultCheckerPanel';

interface ResultsAndReportsProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
  initialTab?: 'results' | 'essay_marking' | 'checker';
}

export default function ResultsAndReports({
  data,
  onRefresh,
  initialTab = 'results',
}: ResultsAndReportsProps) {
  const isStudent = data.me.role === 'student';
  const canApprovePublish = ['super_admin', 'exam_officer'].includes(data.me.role);
  const canMarkEssay = ['super_admin', 'exam_officer', 'teacher', 'hod'].includes(data.me.role);

  const [subTab, setSubTab] = useState<'results' | 'essay_marking' | 'checker'>(initialTab);
  const [filterClass, setFilterClass] = useState('all');
  const [filterSubject, setFilterSubject] = useState('all');
  const [filterSession, setFilterSession] = useState('all');
  const [filterTerm, setFilterTerm] = useState('all');
  const [search, setSearch] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingResult, setEditingResult] = useState<ExaminationResult | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const [editReason, setEditReason] = useState('');

  // Essay Grading local state
  const [marksDraft, setMarksDraft] = useState<Record<string, number>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<Record<string, string>>({});

  const results = data.results || [];
  const students = data.students || [];
  const profiles = data.profiles || [];
  const exams = data.examinations || [];
  const questions = data.questions || [];
  const answers = data.answers || [];
  const attempts = data.attempts || [];

  const uniqueTermNames = useMemo(() => {
    const names = Array.from(new Set(data.terms.map((t) => t.name)));
    return names.length > 0 ? names : ['First Term', 'Second Term', 'Third Term'];
  }, [data.terms]);

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filterClass !== 'all' && r.classId !== filterClass) return false;
      if (filterSubject !== 'all' && r.subjectId !== filterSubject) return false;
      if (filterSession !== 'all' && r.sessionId !== filterSession) return false;
      if (filterTerm !== 'all') {
        const t = data.terms.find((term) => term.id === r.termId);
        if (t?.name !== filterTerm) return false;
      }
      if (search.trim()) {
        const stu = students.find((s) => s.id === r.studentId);
        const prof = stu ? profiles.find((p) => p.id === stu.profileId) : undefined;
        const q = search.toLowerCase();
        if (
          !(prof?.fullName.toLowerCase().includes(q) || stu?.admissionNumber.toLowerCase().includes(q))
        ) {
          return false;
        }
      }
      return true;
    });
  }, [results, filterClass, filterSubject, filterSession, filterTerm, data.terms, search, students, profiles]);

  const semesterProgressData = useMemo(() => {
    const grouped = new Map<string, { label: string; totalPct: number; count: number; passed: number }>();
    for (const r of results) {
      const sess = data.sessions.find((s) => s.id === r.sessionId);
      const term = data.terms.find((t) => t.id === r.termId);
      const key = `${r.sessionId}_${term?.name || r.termId}`;
      const shortSess = (sess?.name || '').replace(' Academic Session', '');
      const label = `${shortSess} · ${term?.name || 'Term'}`.trim();
      const entry = grouped.get(key) || { label, totalPct: 0, count: 0, passed: 0 };
      entry.totalPct += r.percentage;
      entry.count += 1;
      if (r.passed) entry.passed += 1;
      grouped.set(key, entry);
    }
    return Array.from(grouped.values()).map((g) => ({
      semester: g.label,
      average: Math.round((g.totalPct / g.count) * 10) / 10,
      exams: g.count,
      passed: g.passed,
    }));
  }, [results, data.sessions, data.terms]);

  const manualQueue = useMemo(() => {
    return answers.filter((a) => a.requiresManualMarking);
  }, [answers]);

  const handleStatusChange = async (resultIds: string[], status: ResultStatus) => {
    setError(null);
    setFeedback(null);
    try {
      await apiFetch('/api/results', {
        method: 'POST',
        body: JSON.stringify({
          action: 'update_result_status',
          payload: { resultIds, status },
        }),
      });
      setFeedback(`Updated ${resultIds.length} result(s) to ${status}.`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update result status.');
    }
  };

  const handleGradeEssay = async (answerId: string, finalize: boolean) => {
    setError(null);
    setFeedback(null);
    const ans = answers.find((a) => a.id === answerId);
    const awarded = marksDraft[answerId] ?? ans?.marksAwarded ?? 0;
    const notes = feedbackDraft[answerId] ?? ans?.teacherFeedback ?? '';
    try {
      await apiFetch('/api/results', {
        method: 'POST',
        body: JSON.stringify({
          action: 'grade_essay',
          payload: {
            answerId,
            marksAwarded: awarded,
            teacherFeedback: notes,
            finalize,
          },
        }),
      });
      setFeedback(finalize ? 'Final essay marks submitted and total recalculated.' : 'Draft marks saved.');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Essay grading failed.');
    }
  };

  const handleScoreCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingResult) return;
    setError(null);
    try {
      await apiFetch('/api/results', {
        method: 'POST',
        body: JSON.stringify({
          action: 'correct_result_score',
          payload: {
            resultId: editingResult.id,
            totalScore: editScore,
            correctionReason: editReason,
          },
        }),
      });
      setFeedback('Result score adjusted and recorded in audit log.');
      setEditingResult(null);
      setEditReason('');
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Adjustment failed.');
    }
  };

  const handleExport = (format: 'pdf' | 'xlsx' | 'csv') => {
    const { headers, rows } = buildResultsExportRows({
      results: filteredResults,
      students,
      profiles,
      classes: data.classes,
      subjects: data.subjects,
      examinations: exams,
      sessions: data.sessions,
      terms: data.terms,
    });
    if (format === 'csv') {
      exportRowsToCsv('Juneberry_Examination_Results.csv', headers, rows);
    } else if (format === 'xlsx') {
      exportRowsToExcel('Juneberry_Examination_Results.xlsx', 'Results', headers, rows);
    } else {
      downloadSummaryReportPdf({
        settings: data.settings,
        title: 'Examination Results Summary Report',
        subtitle: `Generated ${new Date().toLocaleDateString()} · ${filteredResults.length} records`,
        headers,
        rows,
        filename: 'Juneberry_Results_Summary.pdf',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4 shadow-md">
        <div>
          <h2 className="font-display text-lg font-bold text-[#1E103D]">
            {isStudent
              ? 'My Academic Progress & Official Results'
              : 'Results Management, Result Checker & Exports'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {isStudent
              ? 'Track your performance across all academic semesters and verify official published grades.'
              : `${filteredResults.length} result record(s) · ${manualQueue.filter((a) => !a.markedByProfileId).length} essay response(s) awaiting manual marking`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-purple-100/70 rounded-lg mr-1">
            <button
              type="button"
              onClick={() => setSubTab('results')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                subTab === 'results'
                  ? 'bg-[#4C1D95] text-white shadow-sm'
                  : 'text-[#1E103D] hover:bg-white/60'
              }`}
            >
              {isStudent ? 'All-Semester Progress' : 'Results Ledger'}
            </button>
            {!isStudent && canMarkEssay && (
              <button
                type="button"
                onClick={() => setSubTab('essay_marking')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  subTab === 'essay_marking'
                    ? 'bg-[#4C1D95] text-white shadow-sm'
                    : 'text-[#1E103D] hover:bg-white/60'
                }`}
              >
                Essay Marking ({manualQueue.filter((a) => !a.markedByProfileId).length})
              </button>
            )}
            <button
              type="button"
              onClick={() => setSubTab('checker')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md inline-flex items-center gap-1 transition-colors ${
                subTab === 'checker'
                  ? 'bg-[#FACC15] text-[#1E103D] shadow-sm font-bold'
                  : 'text-[#1E103D] hover:bg-white/60'
              }`}
            >
              <Award className="w-3.5 h-3.5" />
              <span>Result Checker</span>
            </button>
          </div>

          {!isStudent && subTab === 'results' && (
            <>
              <button
                type="button"
                onClick={() => handleExport('pdf')}
                className="px-3 py-2 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-50 flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('xlsx')}
                className="px-3 py-2 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-50 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
              <button
                type="button"
                onClick={() => handleExport('csv')}
                className="px-3 py-2 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-50"
              >
                CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-2 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-50 flex items-center gap-1.5 no-print"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
            </>
          )}
        </div>
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

      {subTab === 'checker' && (
        <ResultCheckerPanel
          sessions={data.sessions}
          terms={data.terms}
          defaultAdmissionNumber={data.studentRecord?.admissionNumber || ''}
          settings={data.settings}
        />
      )}

      {/* ESSAY MANUAL MARKING VIEW */}
      {subTab === 'essay_marking' && !isStudent && (
        <div className="space-y-4">
          {manualQueue.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
              No essay or subjective responses awaiting manual grading.
            </div>
          ) : (
            manualQueue.map((ans) => {
              const att = attempts.find((a) => a.id === ans.attemptId);
              const ex = att ? exams.find((e) => e.id === att.examinationId) : undefined;
              const q = questions.find((item) => item.id === ans.questionId);
              const stu = att ? students.find((s) => s.id === att.studentId) : undefined;
              const stuProf = stu ? profiles.find((p) => p.id === stu.profileId) : undefined;
              const maxMarks = q?.marks ?? 10;

              return (
                <div key={ans.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div className="text-xs text-slate-600">
                      <strong className="text-slate-900">{stuProf?.fullName || 'Student'}</strong> (
                      <span className="font-mono-tabular">{stu?.admissionNumber}</span>) ·{' '}
                      {ex?.title}
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        ans.markedByProfileId ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {ans.markedByProfileId ? 'GRADED' : 'AWAITING MARKING'}
                    </span>
                  </div>

                  <div className="text-sm font-medium text-slate-900">{q?.questionText}</div>
                  {q?.markingGuide && (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                      <strong>Marking Guide:</strong> {q.markingGuide}
                    </div>
                  )}

                  <div className="p-4 rounded-lg border border-slate-200 bg-white text-sm text-slate-800 whitespace-pre-wrap">
                    {typeof ans.response === 'string' && ans.response.trim()
                      ? ans.response
                      : 'No response entered by candidate.'}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Awarded Marks (Max {maxMarks})
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={maxMarks}
                        step={0.5}
                        value={marksDraft[ans.id] ?? ans.marksAwarded}
                        onChange={(e) =>
                          setMarksDraft((prev) => ({
                            ...prev,
                            [ans.id]: Number(e.target.value),
                          }))
                        }
                        className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-5">
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Examiner Feedback
                      </label>
                      <input
                        type="text"
                        value={feedbackDraft[ans.id] ?? ans.teacherFeedback ?? ''}
                        onChange={(e) =>
                          setFeedbackDraft((prev) => ({
                            ...prev,
                            [ans.id]: e.target.value,
                          }))
                        }
                        placeholder="Constructive grading notes..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="sm:col-span-4 flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => void handleGradeEssay(ans.id, false)}
                        className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                      >
                        Save Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleGradeEssay(ans.id, true)}
                        className="px-4 py-2 text-xs font-semibold bg-[#0A1E3D] text-white rounded-lg"
                      >
                        Submit Final Marks
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* RESULTS LEDGER & STUDENT ALL-SEMESTER PROGRESS */}
      {subTab === 'results' && (
        <>
          {isStudent && semesterProgressData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-4 bg-gradient-to-br from-[#2E1065] via-[#4C1D95] to-[#0A1E3D] text-white rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-lg">
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#FACC15] uppercase tracking-wider">
                    <TrendingUp className="w-4 h-4" />
                    <span>All-Semester Summary</span>
                  </div>
                  <div className="font-mono-tabular text-3xl font-bold mt-2 text-white">
                    {results.length > 0
                      ? `${Math.round((results.reduce((acc, r) => acc + r.percentage, 0) / results.length) * 10) / 10}%`
                      : '0%'}
                  </div>
                  <div className="text-xs text-purple-100 mt-1">
                    Cumulative average across {semesterProgressData.length} term{semesterProgressData.length === 1 ? '' : 's'} ({results.length} published script{results.length === 1 ? '' : 's'})
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/15 text-xs">
                  <div>
                    <div className="text-purple-200">Subjects Passed</div>
                    <div className="font-mono-tabular text-lg font-bold text-[#FACC15]">
                      {results.filter((r) => r.passed).length}/{results.length}
                    </div>
                  </div>
                  <div>
                    <div className="text-purple-200">Best Term Avg</div>
                    <div className="font-mono-tabular text-lg font-bold text-emerald-300">
                      {Math.max(...semesterProgressData.map((d) => d.average))}%
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display text-sm font-bold text-[#1E103D]">
                    Term-by-Term Academic Progress (%)
                  </h3>
                  <span className="text-xs text-slate-500">All Academic Semesters</span>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={semesterProgressData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#EDE9FE" vertical={false} />
                      <XAxis dataKey="semester" tick={{ fontSize: 11, fill: '#1E103D' }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#4C1D95' }} />
                      <Tooltip />
                      <Bar dataKey="average" name="Term Average %" fill="#5B21B6" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-3 flex-1">
              {!isStudent && (
                <input
                  type="search"
                  placeholder="Search student name or admission no..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg w-full sm:w-64"
                />
              )}
              <select
                aria-label="Filter results by session"
                value={filterSession}
                onChange={(e) => setFilterSession(e.target.value)}
                className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
              >
                <option value="all">All Academic Sessions</option>
                {data.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter results by term"
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
              >
                <option value="all">All Terms</option>
                {uniqueTermNames.map((tn) => (
                  <option key={tn} value={tn}>
                    {tn}
                  </option>
                ))}
              </select>
              {!isStudent && (
                <select
                  aria-label="Filter results by class"
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
                >
                  <option value="all">All Classes</option>
                  {data.classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Filter results by subject"
                value={filterSubject}
                onChange={(e) => setFilterSubject(e.target.value)}
                className="px-3 py-1.5 text-xs border border-purple-200 rounded-lg bg-white"
              >
                <option value="all">All Subjects</option>
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {canApprovePublish && filteredResults.some((r) => r.status !== 'published' && r.manualGradingCompleted) && (
              <button
                type="button"
                onClick={() => {
                  const readyIds = filteredResults
                    .filter((r) => r.status !== 'published' && r.manualGradingCompleted)
                    .map((r) => r.id);
                  void handleStatusChange(readyIds, 'published');
                }}
                className="px-3.5 py-1.5 text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Publish All Ready Results</span>
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredResults.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                {isStudent
                  ? 'No officially published results are available for your account yet.'
                  : 'No examination results match your filters.'}
              </div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-slate-200">
                  {filteredResults.map((r) => {
                    const stu = students.find((s) => s.id === r.studentId) || data.studentRecord;
                    const prof = stu ? profiles.find((p) => p.id === stu.profileId) : data.me;
                    const cls = data.classes.find((c) => c.id === r.classId);
                    const sub = data.subjects.find((s) => s.id === r.subjectId);
                    const ex = exams.find((e) => e.id === r.examinationId);
                    const sess = data.sessions.find((s) => s.id === r.sessionId);
                    const term = data.terms.find((t) => t.id === r.termId);

                    return (
                      <div key={r.id} className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            {!isStudent && (
                              <div className="text-xs font-mono-tabular text-slate-500 mb-0.5">
                                {prof?.fullName || 'Student'} · {stu?.admissionNumber} · {cls?.name}
                              </div>
                            )}
                            <div className="font-semibold text-sm text-slate-900">{sub?.name}</div>
                            <div className="text-xs text-slate-500">{ex?.title}</div>
                          </div>
                          <span
                            className={`text-[11px] font-semibold shrink-0 ${
                              r.status === 'published'
                                ? 'text-emerald-700'
                                : r.status === 'withheld'
                                  ? 'text-red-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {r.status.replace('_', ' ').toUpperCase()}
                          </span>
                        </div>

                        <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-xs">
                          <div>
                            <div className="text-slate-500">Objective</div>
                            <div className="font-mono-tabular font-medium text-slate-900">{r.objectiveScore}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Essay</div>
                            <div className="font-mono-tabular font-medium text-slate-900">{r.subjectiveScore}</div>
                          </div>
                          <div>
                            <div className="text-slate-500">Total</div>
                            <div className="font-mono-tabular font-semibold text-slate-900">
                              {r.totalScore}/{r.totalPossibleMarks}
                            </div>
                          </div>
                          <div>
                            <div className="text-slate-500">% / Grade</div>
                            <div className="font-mono-tabular font-bold text-[#0A1E3D]">
                              {r.percentage}% ({r.grade})
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              downloadStudentResultPdf({
                                settings: data.settings,
                                studentName: prof?.fullName || data.me.fullName,
                                admissionNumber: stu?.admissionNumber || '',
                                className: cls?.name || '',
                                sessionName: sess?.name || '',
                                termName: term?.name || '',
                                examTitle: ex?.title || '',
                                subjectName: sub?.name || '',
                                result: r,
                              })
                            }
                            className="px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50"
                          >
                            PDF Slip
                          </button>

                          {canApprovePublish && r.status !== 'published' && (
                            <button
                              type="button"
                              disabled={!r.manualGradingCompleted}
                              onClick={() => void handleStatusChange([r.id], 'published')}
                              className="px-3 py-1.5 text-xs font-semibold bg-[#0A1E3D] text-white rounded-lg disabled:opacity-40"
                            >
                              Publish
                            </button>
                          )}

                          {data.me.role === 'super_admin' && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingResult(r);
                                setEditScore(r.totalScore);
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium text-[#163A70] hover:underline"
                            >
                              Adjust
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        {!isStudent && <th className="py-3 px-4">Student</th>}
                        <th className="py-3 px-4">Subject & Examination</th>
                        <th className="py-3 px-4 text-right">Objective</th>
                        <th className="py-3 px-4 text-right">Essay</th>
                        <th className="py-3 px-4 text-right">Total</th>
                        <th className="py-3 px-4 text-right">% / Grade</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredResults.map((r) => {
                        const stu = students.find((s) => s.id === r.studentId) || data.studentRecord;
                        const prof = stu ? profiles.find((p) => p.id === stu.profileId) : data.me;
                        const cls = data.classes.find((c) => c.id === r.classId);
                        const sub = data.subjects.find((s) => s.id === r.subjectId);
                        const ex = exams.find((e) => e.id === r.examinationId);
                        const sess = data.sessions.find((s) => s.id === r.sessionId);
                        const term = data.terms.find((t) => t.id === r.termId);

                        return (
                          <tr key={r.id} className="hover:bg-slate-50">
                            {!isStudent && (
                              <td className="py-3 px-4">
                                <div className="font-medium text-slate-900">
                                  {prof?.fullName || 'Student'}
                                </div>
                                <div className="text-xs font-mono-tabular text-slate-500">
                                  {stu?.admissionNumber} · {cls?.name}
                                </div>
                              </td>
                            )}
                            <td className="py-3 px-4">
                              <div className="font-medium text-slate-900">{sub?.name}</div>
                              <div className="text-xs text-slate-500">{ex?.title}</div>
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular text-xs">
                              {r.objectiveScore}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular text-xs">
                              {r.subjectiveScore}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                              {r.totalScore}/{r.totalPossibleMarks}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular">
                              <span className="font-bold text-[#0A1E3D]">{r.percentage}%</span>{' '}
                              <span className="text-xs text-slate-600">({r.grade})</span>
                            </td>
                            <td className="py-3 px-4 text-xs font-semibold">
                              <span
                                className={
                                  r.status === 'published'
                                    ? 'text-emerald-700'
                                    : r.status === 'withheld'
                                      ? 'text-red-700'
                                      : 'text-amber-700'
                                }
                              >
                                {r.status.replace('_', ' ').toUpperCase()}
                              </span>
                              {!r.manualGradingCompleted && (
                                <div className="text-[11px] font-normal text-amber-700">
                                  Essay pending
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() =>
                                  downloadStudentResultPdf({
                                    settings: data.settings,
                                    studentName: prof?.fullName || data.me.fullName,
                                    admissionNumber: stu?.admissionNumber || '',
                                    className: cls?.name || '',
                                    sessionName: sess?.name || '',
                                    termName: term?.name || '',
                                    examTitle: ex?.title || '',
                                    subjectName: sub?.name || '',
                                    result: r,
                                  })
                                }
                                className="px-2.5 py-1 text-xs font-medium border border-slate-300 rounded hover:bg-slate-50"
                              >
                                PDF Slip
                              </button>

                              {canApprovePublish && r.status !== 'published' && (
                                <button
                                  type="button"
                                  disabled={!r.manualGradingCompleted}
                                  onClick={() => void handleStatusChange([r.id], 'published')}
                                  className="px-2.5 py-1 text-xs font-semibold bg-[#0A1E3D] text-white rounded disabled:opacity-40"
                                >
                                  Publish
                                </button>
                              )}

                              {data.me.role === 'super_admin' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingResult(r);
                                    setEditScore(r.totalScore);
                                  }}
                                  className="px-2.5 py-1 text-xs font-medium text-[#163A70] hover:underline"
                                >
                                  Adjust
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Score Adjustment Modal (Super Admin Only) */}
      {editingResult && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleScoreCorrection}
            className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
              <Lock className="w-4 h-4 text-[#B8860B]" />
              <span>Audited Result Score Adjustment</span>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                New Total Score (Max {editingResult.totalPossibleMarks})
              </label>
              <input
                type="number"
                step={0.5}
                min={0}
                max={editingResult.totalPossibleMarks}
                required
                value={editScore}
                onChange={(e) => setEditScore(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Mandatory Audit Reason for Change
              </label>
              <textarea
                rows={2}
                required
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                placeholder="Document remark or moderation rationale..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingResult(null)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#0A1E3D] text-white rounded-lg"
              >
                Save Audited Adjustment
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
