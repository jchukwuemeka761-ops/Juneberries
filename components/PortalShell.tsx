'use client';

import React, { useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  Shield,
  Users,
  X,
} from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch, setAuthToken } from '@/lib/api-client';
import type { Examination, UserRole } from '@/lib/types';
import { EXAM_TYPE_LABELS, ROLE_LABELS } from '@/lib/types';
import DashboardAnalytics from './DashboardAnalytics';
import QuestionBankManager from './QuestionBankManager';
import ExamManager from './ExamManager';
import LiveMonitoring from './LiveMonitoring';
import ResultsAndReports from './ResultsAndReports';
import AcademicAndAdminManager from './AcademicAndAdminManager';
import CbtExamRunner from './CbtExamRunner';
import ResultCheckerPanel from './ResultCheckerPanel';
import {
  PortalSlideshowBackdrop,
  SlideshowSubheadingHero,
  type SlideshowScope,
} from './PortalSlideshowBackdrop';

interface PortalShellProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
  onLoggedOut: () => void;
  defaultNav?: NavKey;
}

export type NavKey =
  | 'overview'
  | 'operations'
  | 'student-exams'
  | 'student-history'
  | 'student-results'
  | 'student-profile'
  | 'result-checker'
  | 'questions'
  | 'exams'
  | 'monitoring'
  | 'essay-marking'
  | 'results'
  | 'students'
  | 'staff'
  | 'academics'
  | 'settings'
  | 'audit'
  | 'announcements'
  | 'notifications';

interface NavItem {
  key: NavKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getNavForRole(role: UserRole): NavItem[] {
  if (role === 'student') {
    return [
      { key: 'student-exams', label: 'Available Exams', icon: ClipboardCheck },
      { key: 'student-history', label: 'Exam History', icon: Calendar },
      { key: 'student-results', label: 'Semester Progress & Results', icon: Award },
      { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
      { key: 'notifications', label: 'Notifications', icon: Bell },
      { key: 'student-profile', label: 'My Profile & Password', icon: Users },
    ];
  }
  if (role === 'invigilator') {
    return [
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ];
  }
  if (role === 'teacher') {
    return [
      { key: 'questions', label: 'Templates & Questions', icon: BookOpen },
      { key: 'exams', label: 'Quizzes & Exams', icon: Calendar },
      { key: 'essay-marking', label: 'Essay Marking', icon: ClipboardCheck },
      { key: 'results', label: 'Subject Reports', icon: Award },
      { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
      { key: 'overview', label: 'Teacher Analytics', icon: BarChart3 },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ];
  }
  if (role === 'hod') {
    return [
      { key: 'overview', label: 'Department Analytics', icon: BarChart3 },
      { key: 'questions', label: 'Question Review', icon: BookOpen },
      { key: 'results', label: 'Department Results', icon: Award },
      { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ];
  }
  if (role === 'principal') {
    return [
      { key: 'overview', label: 'School Analytics', icon: BarChart3 },
      { key: 'operations', label: 'Teacher & Student Monitor', icon: ClipboardCheck },
      { key: 'monitoring', label: 'Live Examinations', icon: Activity },
      { key: 'results', label: 'Academic Reports', icon: Award },
      { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
      { key: 'students', label: 'Student Directory', icon: GraduationCap },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ];
  }
  if (role === 'exam_officer') {
    return [
      { key: 'overview', label: 'Exam Overview', icon: BarChart3 },
      { key: 'exams', label: 'Exam Scheduling', icon: Calendar },
      { key: 'questions', label: 'Templates & Question Bank', icon: BookOpen },
      { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
      { key: 'results', label: 'Results & Reports', icon: Award },
      { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
      { key: 'notifications', label: 'Notifications', icon: Bell },
    ];
  }

  // super_admin
  return [
    { key: 'overview', label: 'Overview Dashboard', icon: BarChart3 },
    { key: 'operations', label: 'Teacher & Student Monitor', icon: ClipboardCheck },
    { key: 'students', label: 'Students', icon: GraduationCap },
    { key: 'staff', label: 'Staff & Termination', icon: Users },
    { key: 'academics', label: 'Classes & Curriculum', icon: FileSpreadsheet },
    { key: 'questions', label: 'Templates & Question Bank', icon: BookOpen },
    { key: 'exams', label: 'Examinations', icon: Calendar },
    { key: 'monitoring', label: 'Live Monitoring', icon: Activity },
    { key: 'results', label: 'Results & Reports', icon: Award },
    { key: 'result-checker', label: 'CBT Result Checker', icon: FileSpreadsheet },
    { key: 'announcements', label: 'Announcements', icon: Bell },
    { key: 'audit', label: 'Audit Logs', icon: Shield },
    { key: 'settings', label: 'System Settings', icon: Settings },
  ];
}

export default function PortalShell({
  data,
  onRefresh,
  onLoggedOut,
  defaultNav,
}: PortalShellProps) {
  const navItems = getNavForRole(data.me.role);
  const initialKey =
    defaultNav && navItems.some((n) => n.key === defaultNav)
      ? defaultNav
      : navItems[0].key;
  const [activeNav, setActiveNav] = useState<NavKey>(initialKey);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCbtExam, setActiveCbtExam] = useState<Examination | null>(null);

  // Change Password modal
  const [showPwModal, setShowPwModal] = useState(false);
  const [currPw, setCurrPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const unreadNotifs = data.notifications.filter((n) => !n.isRead).length;

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setAuthToken(null);
    onLoggedOut();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr(null);
    setPwMsg(null);
    try {
      await apiFetch('/api/auth/password', {
        method: 'POST',
        body: JSON.stringify({
          action: 'change_password',
          currentPassword: currPw,
          newPassword: newPw,
        }),
      });
      setPwMsg('Password updated successfully.');
      setCurrPw('');
      setNewPw('');
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Unable to change password.');
    }
  };

  // Distraction-minimised CBT Runner takes full main workspace when active
  if (activeCbtExam && data.me.role === 'student') {
    return (
      <div className="min-h-screen bg-[#F8FAFC] p-4 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <CbtExamRunner
            data={data}
            examination={activeCbtExam}
            onExit={async () => {
              setActiveCbtExam(null);
              await onRefresh();
            }}
          />
        </div>
      </div>
    );
  }

  const currentLabel = navItems.find((n) => n.key === activeNav)?.label || 'Portal';
  const shellBackdropScope: SlideshowScope =
    activeNav === 'questions' || data.me.role === 'teacher'
      ? 'authenticated_teacher'
      : data.me.role === 'student'
        ? 'authenticated_student'
        : 'authenticated_admin';

  return (
    <div className="relative min-h-screen flex text-slate-900">
      <PortalSlideshowBackdrop scope={shellBackdropScope} />

      {/* Desktop Sidebar (260px) */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:h-screen lg:sticky lg:top-0 bg-gradient-to-b from-[#1E103D]/95 via-[#2E1065]/95 to-[#0A1E3D]/95 backdrop-blur-md text-white shrink-0 border-r border-[#4C1D95]/60 no-print z-20">
        <div className="p-5 border-b border-white/10 flex items-center gap-3">
          <img
            src={data.settings.logoUrl || '/images/juneberry_crest.jpg'}
            alt="Juneberries Crest"
            referrerPolicy="no-referrer"
            className="w-9 h-9 rounded-md object-cover border border-[#FACC15]/40 shrink-0"
          />
          <div className="min-w-0">
            <div className="font-display text-sm font-bold truncate">Juneberries CBT</div>
            <div className="text-[11px] font-semibold text-[#FACC15] truncate">
              {ROLE_LABELS[data.me.role]}
            </div>
          </div>
        </div>

        <nav aria-label="Primary Sidebar" className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveNav(item.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs transition-all ${
                  active
                    ? 'bg-[#FACC15] text-[#1E103D] font-bold shadow-sm'
                    : 'text-purple-100 hover:bg-white/10 hover:text-white font-medium'
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.key === 'notifications' && unreadNotifs > 0 && (
                  <span
                    className={`font-mono-tabular text-[11px] font-bold ${
                      active ? 'text-[#1E103D]' : 'text-[#FACC15]'
                    }`}
                  >
                    {unreadNotifs}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 text-xs">
          <div className="font-medium text-white truncate">{data.me.fullName}</div>
          <div className="text-slate-400 truncate">{data.me.email}</div>
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowPwModal(true)}
              className="flex-1 py-1.5 px-2.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-medium"
            >
              Password
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="py-1.5 px-2.5 rounded bg-white/10 hover:bg-red-600/80 text-white text-xs font-medium flex items-center gap-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Exit</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-64 bg-gradient-to-b from-[#1E103D] via-[#2E1065] to-[#0A1E3D] text-white flex flex-col z-10">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <span className="font-display text-sm font-bold text-[#FACC15]">Juneberries CBT</span>
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.key);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium ${
                      activeNav === item.key
                        ? 'bg-[#FACC15] text-[#1E103D] font-bold'
                        : 'text-purple-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="w-full py-2 bg-[#FACC15] text-[#1E103D] rounded text-xs font-bold"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Viewport */}
      <div className="relative z-10 flex-1 flex flex-col min-w-0">
        <header className="bg-white/95 backdrop-blur-md border-b border-purple-200/80 px-5 lg:px-8 py-4 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              aria-label="Open navigation menu"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-purple-200 text-[#1E103D]"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="text-xs text-[#5B21B6] font-medium truncate">
                {data.settings.schoolName} / {currentLabel}
              </div>
              <h1 className="font-display text-lg font-bold text-[#1E103D] truncate">
                {currentLabel}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveNav('notifications')}
              className="px-3 py-1.5 text-xs font-medium border border-purple-200 rounded-lg hover:bg-purple-50 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Bell className="w-3.5 h-3.5 text-[#4C1D95]" />
              <span>Alerts ({unreadNotifs})</span>
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="hidden sm:inline-flex px-3.5 py-1.5 text-xs font-bold bg-[#FACC15] hover:bg-[#EAB308] text-[#1E103D] rounded-lg whitespace-nowrap"
            >
              Sign Out
            </button>
          </div>
        </header>

        <main className="flex-1 p-5 lg:p-8 max-w-7xl w-full mx-auto">
          {activeNav === 'overview' && <DashboardAnalytics data={data} />}

          {/* STUDENT PORTAL: AVAILABLE EXAMS WITH INTERACTIVE SLIDESHOW SUBHEADING */}
          {activeNav === 'student-exams' && (
            <div className="space-y-6">
              <SlideshowSubheadingHero
                scope="authenticated_student"
                eyebrow={`${data.settings.schoolName} · Student Examination Portal`}
                title={`Welcome, ${data.me.fullName}`}
                subtitle={`Admission / Exam No: ${data.studentRecord?.admissionNumber || '—'} · Class: ${data.classes.find((c) => c.id === data.studentRecord?.classId)?.name || '—'} · ${data.sessions.find((s) => s.isCurrent)?.name || ''} (${data.terms.find((t) => t.isCurrent)?.name || ''})`}
                compact
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {(data.examinations || []).length === 0 ? (
                  <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                    No examinations are currently assigned to your class.
                  </div>
                ) : (
                  (data.examinations || []).map((ex) => {
                    const sub = data.subjects.find((s) => s.id === ex.subjectId);
                    const myAttempts = (data.attempts || []).filter(
                      (a) => a.examinationId === ex.id
                    );
                    const inProgress = myAttempts.find((a) => a.status === 'in_progress');
                    const attemptsExhausted =
                      myAttempts.length >= ex.maxAttempts && !inProgress;
                    const canEnter =
                      (ex.status === 'active' || ex.status === 'rescheduled') &&
                      !attemptsExhausted;

                    return (
                      <div
                        key={ex.id}
                        className="bg-white/95 backdrop-blur-md border border-purple-200/80 rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-md"
                      >
                        <div className="space-y-2">
                          <div className="text-xs text-slate-600">
                            {sub?.name} · {EXAM_TYPE_LABELS[ex.examType]} ·{' '}
                            <span className="font-bold text-[#4C1D95]">
                              {ex.status.toUpperCase()}
                            </span>
                          </div>
                          <h3 className="font-display text-base font-bold text-[#1E103D]">
                            {ex.title}
                          </h3>
                          <div className="text-xs text-slate-600 font-mono-tabular">
                            {ex.examDate} ({ex.startTime}–{ex.endTime}) · {ex.durationMinutes} mins ·{' '}
                            {ex.questionCount} questions · {ex.totalMarks} marks
                          </div>
                          <div className="text-xs text-slate-500 font-mono-tabular">
                            Attempts used: {myAttempts.length} / {ex.maxAttempts}
                          </div>
                        </div>

                        <div className="flex items-center justify-end">
                          {inProgress ? (
                            <button
                              type="button"
                              onClick={() => setActiveCbtExam(ex)}
                              className="px-4 py-2 bg-[#FACC15] hover:bg-[#EAB308] text-[#1E103D] text-xs font-bold rounded-lg shadow-sm"
                            >
                              Resume Active Exam
                            </button>
                          ) : canEnter ? (
                            <button
                              type="button"
                              onClick={() => setActiveCbtExam(ex)}
                              className="px-4 py-2 bg-gradient-to-r from-[#4C1D95] to-[#0A1E3D] hover:from-[#5B21B6] hover:to-[#132E59] text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                              Enter Examination
                            </button>
                          ) : (
                            <span className="text-xs font-medium text-slate-500">
                              {attemptsExhausted ? 'Attempt Completed' : `Status: ${ex.status}`}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Class Subjects & Questions Set for Student's Class */}
              {(data.studentClassReadiness || []).length > 0 && (
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div>
                    <h3 className="font-display text-sm font-bold text-slate-900">
                      Subjects &amp; Question Readiness for{' '}
                      {data.classes.find((c) => c.id === data.studentRecord?.classId)?.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Overview of approved questions and scheduled CBT assessments prepared by your teachers for your class.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {(data.studentClassReadiness || []).map((item) => (
                      <div
                        key={item.subjectId}
                        className="p-3.5 rounded-lg border border-slate-200 bg-slate-50 flex flex-col justify-between gap-2"
                      >
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {item.subjectName}
                          </div>
                          <div className="font-mono-tabular text-[11px] text-slate-500">
                            {item.subjectCode}
                          </div>
                        </div>
                        <div className="text-xs text-slate-700 font-mono-tabular flex items-center justify-between pt-1 border-t border-slate-200">
                          <span>{item.approvedQuestionCount} approved Qs</span>
                          <span className="font-semibold text-[#0A1E3D]">
                            {item.activeExamCount} active · {item.scheduledExamCount} upcoming
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STUDENT PORTAL: EXAM HISTORY */}
          {activeNav === 'student-history' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h2 className="font-display text-base font-bold text-slate-900">
                  My Examination Attempt History
                </h2>
              </div>
              {(data.attempts || []).length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  You have not started any examinations yet.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Examination</th>
                      <th className="py-3 px-4">Attempt #</th>
                      <th className="py-3 px-4">Started</th>
                      <th className="py-3 px-4">Submitted</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(data.attempts || []).map((att) => {
                      const ex = data.examinations?.find((e) => e.id === att.examinationId);
                      return (
                        <tr key={att.id}>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {ex?.title || att.examinationId}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs">
                            #{att.attemptNumber}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">
                            {new Date(att.startedAt).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-xs text-slate-600">
                            {att.submittedAt ? new Date(att.submittedAt).toLocaleString() : 'Active'}
                          </td>
                          <td className="py-3 px-4 text-xs font-semibold text-[#0A1E3D]">
                            {att.status.replace('_', ' ').toUpperCase()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* STUDENT PORTAL: PROFILE */}
          {activeNav === 'student-profile' && (
            <div className="max-w-2xl bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <h2 className="font-display text-base font-bold text-slate-900">
                Student Profile & Registered Subjects
              </h2>
              <div className="grid grid-cols-2 gap-4 text-sm border-b border-slate-200 pb-4">
                <div>
                  <div className="text-xs text-slate-500">Full Name</div>
                  <div className="font-semibold text-slate-900">{data.me.fullName}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Admission Number</div>
                  <div className="font-mono-tabular font-semibold text-[#0A1E3D]">
                    {data.studentRecord?.admissionNumber}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Class</div>
                  <div className="font-medium text-slate-900">
                    {data.classes.find((c) => c.id === data.studentRecord?.classId)?.name}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">Email</div>
                  <div className="text-slate-900">{data.me.email}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-700 mb-2">
                  Registered Subjects
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {data.subjects
                    .filter(
                      (s) =>
                        data.studentRecord &&
                        s.applicableClassIds.includes(data.studentRecord.classId)
                    )
                    .map((s) => (
                      <div key={s.id} className="p-2.5 rounded border border-slate-200 bg-slate-50">
                        {s.name} · <span className="font-mono-tabular text-slate-500">{s.code}</span>
                      </div>
                    ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPwModal(true)}
                className="px-4 py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg inline-flex items-center gap-1.5"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Change Password</span>
              </button>
            </div>
          )}

          {activeNav === 'questions' && (
            <div className="space-y-6">
              <SlideshowSubheadingHero
                scope="authenticated_teacher"
                eyebrow={`${data.settings.schoolName} · Teacher Question Studio`}
                title={
                  data.me.role === 'teacher'
                    ? `${data.me.fullName} — My Classes & Question Workspace`
                    : 'Question Upload Bank & Approval Studio'
                }
                subtitle={
                  data.me.role === 'teacher'
                    ? 'Select any class and subject you teach below to set, organize, and upload examination questions specifically for that class.'
                    : 'Browse any class from Primary 1 to SSS 3 to upload, review, and approve examination questions.'
                }
                compact
              />
              <QuestionBankManager
                data={data}
                onRefresh={onRefresh}
                openUploadByDefault={defaultNav === 'questions'}
              />
            </div>
          )}

          {activeNav === 'exams' && <ExamManager data={data} onRefresh={onRefresh} />}

          {activeNav === 'monitoring' && <LiveMonitoring data={data} onRefresh={onRefresh} />}

          {(activeNav === 'results' || activeNav === 'student-results') && (
            <ResultsAndReports data={data} onRefresh={onRefresh} initialTab="results" />
          )}

          {activeNav === 'result-checker' && (
            <ResultCheckerPanel
              sessions={data.sessions}
              terms={data.terms}
              defaultAdmissionNumber={data.studentRecord?.admissionNumber || ''}
              settings={data.settings}
            />
          )}

          {activeNav === 'essay-marking' && (
            <ResultsAndReports data={data} onRefresh={onRefresh} initialTab="essay_marking" />
          )}

          {activeNav === 'operations' && (
            <div className="space-y-6">
              <SlideshowSubheadingHero
                scope="authenticated_admin"
                eyebrow={`${data.settings.schoolName} · Executive Oversight`}
                title="Proprietor & General Admin Command View"
                subtitle="Monitor every registered teacher’s classes and question uploads alongside student exam progress, and activate, deactivate, or permanently remove staff accounts."
                compact
              />
              <AcademicAndAdminManager
                section="operations"
                data={data}
                onRefresh={onRefresh}
              />
            </div>
          )}

          {(activeNav === 'students' ||
            activeNav === 'staff' ||
            activeNav === 'academics' ||
            activeNav === 'settings' ||
            activeNav === 'audit' ||
            activeNav === 'announcements') && (
            <AcademicAndAdminManager
              section={activeNav}
              data={data}
              onRefresh={onRefresh}
            />
          )}

          {activeNav === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
              <div className="p-5 flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-slate-900">
                  Notification Centre
                </h2>
                {unreadNotifs > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch('/api/admin/manage', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'mark_notification_read', payload: {} }),
                      });
                      await onRefresh();
                    }}
                    className="text-xs font-semibold text-[#163A70] hover:underline"
                  >
                    Mark All Read
                  </button>
                )}
              </div>
              {data.notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No notifications at this time.
                </div>
              ) : (
                data.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-4 flex items-start justify-between gap-4 ${
                      n.isRead ? 'bg-white' : 'bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                      <div className="text-xs text-slate-600 mt-0.5">{n.message}</div>
                      <div className="text-[11px] font-mono-tabular text-slate-400 mt-1">
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                    {!n.isRead && (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch('/api/admin/manage', {
                            method: 'POST',
                            body: JSON.stringify({
                              action: 'mark_notification_read',
                              payload: { id: n.id },
                            }),
                          });
                          await onRefresh();
                        }}
                        className="text-xs font-medium text-[#0A1E3D] hover:underline shrink-0"
                      >
                        Mark Read
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </main>
      </div>

      {/* Password Change Modal */}
      {showPwModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleChangePassword}
            className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-6 space-y-4"
          >
            <h3 className="font-display text-base font-bold text-slate-900">
              Change Account Password
            </h3>
            {pwErr && <div className="p-2.5 text-xs bg-red-50 text-red-700 rounded">{pwErr}</div>}
            {pwMsg && <div className="p-2.5 text-xs bg-emerald-50 text-emerald-700 rounded">{pwMsg}</div>}
            <input
              type="password"
              required
              placeholder="Current Password"
              value={currPw}
              onChange={(e) => setCurrPw(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="password"
              required
              minLength={8}
              placeholder="New Password (min 8 characters)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPwModal(false)}
                className="px-4 py-2 text-xs font-medium border border-slate-300 rounded-lg"
              >
                Close
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-[#0A1E3D] text-white rounded-lg"
              >
                Update Password
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
