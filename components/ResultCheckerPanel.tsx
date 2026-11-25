'use client';

import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, Download, Search, XCircle } from 'lucide-react';
import { apiFetch, type ResultCheckResponse } from '@/lib/api-client';
import { downloadStudentResultPdf } from '@/lib/exports';
import type { AcademicSession, AcademicTerm, SchoolSettings } from '@/lib/types';

interface ResultCheckerPanelProps {
  sessions: AcademicSession[];
  terms: AcademicTerm[];
  defaultAdmissionNumber?: string;
  settings?: SchoolSettings;
}

export default function ResultCheckerPanel({
  sessions,
  terms,
  defaultAdmissionNumber = '',
  settings,
}: ResultCheckerPanelProps) {
  const [admissionNumber, setAdmissionNumber] = useState(defaultAdmissionNumber);
  const [sessionId, setSessionId] = useState<string>('all');
  const [termName, setTermName] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ResultCheckResponse | null>(null);

  const uniqueTermNames = useMemo(() => {
    const names = Array.from(new Set(terms.map((t) => t.name)));
    return names.length > 0 ? names : ['First Term', 'Second Term', 'Third Term'];
  }, [terms]);

  const summary = useMemo(() => {
    if (!report || report.results.length === 0) {
      return { count: 0, meanPercent: 0, passedCount: 0 };
    }
    const mean =
      Math.round(
        (report.results.reduce((acc, r) => acc + r.percentage, 0) / report.results.length) * 10
      ) / 10;
    const passedCount = report.results.filter((r) => r.passed).length;
    return { count: report.results.length, meanPercent: mean, passedCount };
  }, [report]);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<ResultCheckResponse>('/api/results/check', {
        method: 'POST',
        body: JSON.stringify({
          admissionNumber: admissionNumber.trim(),
          sessionId: sessionId === 'all' ? undefined : sessionId,
          termName: termName === 'all' ? undefined : termName,
        }),
      });
      setReport(res);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : 'Unable to check results.');
    } finally {
      setLoading(false);
    }
  };

  const fallbackSettings: SchoolSettings = settings || {
    schoolName: report?.schoolName || 'JUNEBERRIES INTERNATIONAL SCHOOLS',
    motto: 'Excellence, Integrity and Innovation',
    address: 'Plot 14 Academic Way, Victoria Island, Lagos',
    email: 'exams@juneberries.edu.ng',
    phone: '+234 800 555 0199',
    logoUrl: '/images/juneberry_crest.jpg',
    primaryColor: '#4C1D95',
    accentColor: '#EAB308',
    defaultInstructions: '',
    gradingScale: [],
    allowStudentSelfRegistration: true,
    requireAdminApprovalForStudents: true,
    allowUnapprovedQuestionsByAdmin: true,
    allowPartialMultipleSelect: true,
    enableTabSwitchMonitoring: true,
  };

  return (
    <div className="space-y-5">
      <form
        onSubmit={handleCheck}
        className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-6 space-y-5 shadow-xl"
      >
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-purple-100 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#5B21B6]">
              <Award className="w-4 h-4 text-[#D97706]" />
              <span>CBT Center · Official Result Checker</span>
            </div>
            <h2 className="font-display text-xl font-bold text-[#1E103D] mt-1">
              Verify &amp; Download Student CBT Examination Results
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Enter your Student Exam / Registration Number and optionally filter by Academic Session and Term.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
          <div>
            <label htmlFor="rc-adm" className="block text-xs font-semibold text-[#1E103D] mb-1">
              Exam / Registration Number
            </label>
            <input
              id="rc-adm"
              type="text"
              required
              placeholder="e.g. JBS/2026/002"
              value={admissionNumber}
              onChange={(e) => setAdmissionNumber(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-purple-200 rounded-lg bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#6D28D9]"
            />
          </div>

          <div>
            <label htmlFor="rc-session" className="block text-xs font-semibold text-[#1E103D] mb-1">
              Academic Session
            </label>
            <select
              id="rc-session"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-purple-200 rounded-lg bg-white text-slate-900"
            >
              <option value="all">All Academic Sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rc-term" className="block text-xs font-semibold text-[#1E103D] mb-1">
              Term / Semester
            </label>
            <select
              id="rc-term"
              value={termName}
              onChange={(e) => setTermName(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-purple-200 rounded-lg bg-white text-slate-900"
            >
              <option value="all">All Terms</option>
              {uniqueTermNames.map((tn) => (
                <option key={tn} value={tn}>
                  {tn}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#4C1D95] to-[#0A1E3D] hover:from-[#5B21B6] hover:to-[#132E59] text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-md transition-all"
          >
            <Search className="w-4 h-4 text-[#FACC15]" />
            <span>{loading ? 'Checking...' : 'Check Result'}</span>
          </button>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs font-medium text-red-800">
            {error}
          </div>
        )}
      </form>

      {report && (
        <div className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="bg-gradient-to-r from-[#1E103D] via-[#4C1D95] to-[#0A1E3D] text-white p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-[#FDE047] uppercase tracking-wider">
                {report.schoolName} · Official Transcript
              </div>
              <h3 className="font-display text-lg font-bold mt-0.5">{report.studentName}</h3>
              <div className="text-xs text-purple-100 font-mono-tabular mt-0.5">
                {report.admissionNumber} · {report.className}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-5 text-right">
              <div>
                <div className="text-[11px] text-purple-200">Published Exams</div>
                <div className="font-mono-tabular text-xl font-bold text-white">
                  {summary.count}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-purple-200">Overall Average</div>
                <div className="font-mono-tabular text-xl font-bold text-[#FACC15]">
                  {summary.meanPercent}%
                </div>
              </div>
              <div>
                <div className="text-[11px] text-purple-200">Passed</div>
                <div className="font-mono-tabular text-xl font-bold text-emerald-300">
                  {summary.passedCount}/{summary.count}
                </div>
              </div>
            </div>
          </div>

          {report.results.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-600">
              No officially published results found for <strong className="font-mono-tabular">{report.admissionNumber}</strong> under the selected session and term filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-purple-100 bg-purple-50/70 text-xs font-semibold text-[#1E103D]">
                    <th className="py-3 px-4">Subject &amp; Examination</th>
                    <th className="py-3 px-4">Session &amp; Term</th>
                    <th className="py-3 px-4 text-right">Score</th>
                    <th className="py-3 px-4 text-right">% / Grade</th>
                    <th className="py-3 px-4">Remark</th>
                    <th className="py-3 px-4 text-right">Slip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-purple-100">
                  {report.results.map((r) => (
                    <tr key={r.id} className="hover:bg-purple-50/40">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900">{r.subjectName}</div>
                        <div className="text-xs text-slate-500">{r.examTitle}</div>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-700">
                        <div className="font-medium text-[#4C1D95]">{r.sessionName}</div>
                        <div>{r.termName} · {r.className}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                        {r.totalScore}/{r.totalPossibleMarks}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono-tabular">
                        <span className="font-bold text-[#4C1D95]">{r.percentage}%</span>{' '}
                        <span className="text-xs font-semibold text-slate-700">({r.grade})</span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            r.passed ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {r.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{r.remark}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            downloadStudentResultPdf({
                              settings: fallbackSettings,
                              studentName: report.studentName,
                              admissionNumber: report.admissionNumber,
                              className: r.className,
                              sessionName: r.sessionName,
                              termName: r.termName,
                              examTitle: r.examTitle,
                              subjectName: r.subjectName,
                              result: {
                                id: r.id,
                                attemptId: r.id,
                                examinationId: r.id,
                                studentId: report.admissionNumber,
                                sessionId: r.sessionId,
                                termId: r.termId,
                                classId: '',
                                subjectId: '',
                                objectiveScore: r.objectiveScore,
                                subjectiveScore: r.subjectiveScore,
                                totalScore: r.totalScore,
                                totalPossibleMarks: r.totalPossibleMarks,
                                percentage: r.percentage,
                                grade: r.grade,
                                remark: r.remark,
                                passed: r.passed,
                                status: 'published',
                                manualGradingCompleted: true,
                                publishedAt: r.publishedAt,
                                createdAt: r.publishedAt || new Date().toISOString(),
                              },
                            })
                          }
                          className="px-2.5 py-1 text-xs font-semibold border border-purple-300 text-[#4C1D95] rounded-md hover:bg-purple-50 inline-flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" />
                          <span>PDF</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
