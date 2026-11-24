'use client';

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  BookOpen,
  Check,
  GraduationCap,
  Plus,
  Settings,
  Shield,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import { parseCsvLines } from '@/lib/bulk-import';
import {
  buildStudentOperationsRows,
  buildTeacherOperationsRows,
} from '@/lib/portal-routing';
import type { GradeBand, UserRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/types';

export type AdminSection =
  | 'operations'
  | 'students'
  | 'staff'
  | 'academics'
  | 'settings'
  | 'audit'
  | 'announcements';

interface AcademicAndAdminManagerProps {
  section: AdminSection;
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
}

export default function AcademicAndAdminManager({
  section,
  data,
  onRefresh,
}: AcademicAndAdminManagerProps) {
  const isAdmin = data.me.role === 'super_admin';
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Student management state
  const [stuSearch, setStuSearch] = useState('');
  const [stuClassFilter, setStuClassFilter] = useState('all');
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuAdm, setNewStuAdm] = useState('');
  const [newStuClass, setNewStuClass] = useState(data.classes[10]?.id || data.classes[0]?.id || '');
  const [newStuPassword, setNewStuPassword] = useState('');
  const [bulkStuCsv, setBulkStuCsv] = useState('');
  const [showAddStudent, setShowAddStudent] = useState(false);

  // Staff management state
  const [stfName, setStfName] = useState('');
  const [stfEmail, setStfEmail] = useState('');
  const [stfNumber, setStfNumber] = useState('');
  const [stfRole, setStfRole] = useState<UserRole>('teacher');
  const [stfDept, setStfDept] = useState(data.departments[3]?.id || '');
  const [stfDesig, setStfDesig] = useState('');
  const [stfPassword, setStfPassword] = useState('');
  const [assignStaffId, setAssignStaffId] = useState(data.staff?.[0]?.id || '');
  const [assignClassId, setAssignClassId] = useState(data.classes[10]?.id || '');
  const [assignSubjectId, setAssignSubjectId] = useState(data.subjects[14]?.id || '');
  const [confirmDeleteStaffId, setConfirmDeleteStaffId] = useState<string | null>(null);
  const [opsSearch, setOpsSearch] = useState('');

  // Academic creation state
  const [deptName, setDeptName] = useState('');
  const [deptCode, setDeptCode] = useState('');
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [subDeptId, setSubDeptId] = useState(data.departments[3]?.id || '');
  const [subLevel, setSubLevel] = useState<'primary' | 'junior_secondary' | 'senior_secondary'>('senior_secondary');
  const [sessName, setSessName] = useState('');
  const [sessStart, setSessStart] = useState('2027-09-14');
  const [sessEnd, setSessEnd] = useState('2028-07-21');

  // Settings state
  const [schoolName, setSchoolName] = useState(data.settings.schoolName);
  const [motto, setMotto] = useState(data.settings.motto);
  const [address, setAddress] = useState(data.settings.address);
  const [phone, setPhone] = useState(data.settings.phone);
  const [defaultInstructions, setDefaultInstructions] = useState(data.settings.defaultInstructions);
  const [gradingScale, setGradingScale] = useState<GradeBand[]>(data.settings.gradingScale);
  const [allowSelfReg, setAllowSelfReg] = useState(data.settings.allowStudentSelfRegistration);
  const [requireApproval, setRequireApproval] = useState(data.settings.requireAdminApprovalForStudents);
  const [allowPartialMs, setAllowPartialMs] = useState(data.settings.allowPartialMultipleSelect);

  // Announcement state
  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');
  const [annRole, setAnnRole] = useState('all');

  const students = data.students || [];
  const profiles = data.profiles || [];
  const staffList = data.staff || [];

  const teacherOps = useMemo(() => {
    const rows = buildTeacherOperationsRows({
      staff: staffList,
      profiles,
      teacherAssignments: data.teacherAssignments || [],
      classes: data.classes,
      subjects: data.subjects,
      departments: data.departments,
      questions: data.questions || [],
      examinations: data.examinations || [],
      auditLogs: data.auditLogs || [],
    });
    if (!opsSearch.trim()) return rows;
    const q = opsSearch.toLowerCase();
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.staffNumber.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q)
    );
  }, [
    staffList,
    profiles,
    data.teacherAssignments,
    data.classes,
    data.subjects,
    data.departments,
    data.questions,
    data.examinations,
    data.auditLogs,
    opsSearch,
  ]);

  const studentOps = useMemo(() => {
    const rows = buildStudentOperationsRows({
      students,
      profiles,
      classes: data.classes,
      attempts: data.attempts || [],
      results: data.results || [],
    });
    if (!opsSearch.trim()) return rows;
    const q = opsSearch.toLowerCase();
    return rows.filter(
      (r) =>
        r.fullName.toLowerCase().includes(q) ||
        r.admissionNumber.toLowerCase().includes(q) ||
        r.className.toLowerCase().includes(q)
    );
  }, [students, profiles, data.classes, data.attempts, data.results, opsSearch]);

  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      if (stuClassFilter !== 'all' && s.classId !== stuClassFilter) return false;
      if (stuSearch.trim()) {
        const prof = profiles.find((p) => p.id === s.profileId);
        const q = stuSearch.toLowerCase();
        if (
          !(
            prof?.fullName.toLowerCase().includes(q) ||
            s.admissionNumber.toLowerCase().includes(q)
          )
        ) {
          return false;
        }
      }
      return true;
    });
  }, [students, profiles, stuClassFilter, stuSearch]);

  const runAdminAction = async (action: string, payload: Record<string, unknown>, msg: string) => {
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      await apiFetch('/api/admin/manage', {
        method: 'POST',
        body: JSON.stringify({ action, payload }),
      });
      setFeedback(msg);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    await runAdminAction(
      'create_student',
      {
        fullName: newStuName,
        email: newStuEmail,
        admissionNumber: newStuAdm,
        classId: newStuClass,
        password: newStuPassword,
      },
      `Student ${newStuName} provisioned.`
    );
    setNewStuName('');
    setNewStuEmail('');
    setNewStuAdm('');
    setNewStuPassword('');
    setShowAddStudent(false);
  };

  const handleBulkStudents = async (e: React.FormEvent) => {
    e.preventDefault();
    const rows = parseCsvLines(bulkStuCsv);
    if (rows.length < 2) {
      setError('Provide header row and at least one student row.');
      return;
    }
    const payloadStudents = rows.slice(1).map((r) => ({
      fullName: r[0] || '',
      email: r[1] || '',
      admissionNumber: r[2] || '',
      classId: r[3] || newStuClass,
      password: r[4] || '',
    }));
    await runAdminAction('bulk_import_students', { students: payloadStudents }, 'Bulk student import processed.');
    setBulkStuCsv('');
  };

  return (
    <div className="space-y-6">
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

      {/* PROPRIETOR / GENERAL ADMIN OPERATIONS MONITOR */}
      {section === 'operations' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Proprietor & General Admin Operations Monitor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Oversee all teachers&apos; subject/class question uploads, staff account status, and students&apos; examination activity across Primary 1 – SSS 3.
              </p>
            </div>
            <input
              type="search"
              placeholder="Search staff ID, teacher, admission no, or class..."
              value={opsSearch}
              onChange={(e) => setOpsSearch(e.target.value)}
              className="w-full sm:w-80 px-3.5 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#0A1E3D]" />
                <span>Registered Staff</span>
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-1.5">
                {staffList.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {teacherOps.filter((t) => t.isActive).length} active login(s)
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[#B8860B]" />
                <span>Questions Uploaded</span>
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-1.5">
                {(data.questions || []).length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {(data.questions || []).filter((q) => q.approvalStatus === 'approved').length} approved · {(data.questions || []).filter((q) => q.approvalStatus === 'submitted').length} awaiting review
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <GraduationCap className="w-3.5 h-3.5 text-[#0A1E3D]" />
                <span>Registered Students</span>
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-1.5">
                {students.length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {students.filter((s) => s.accountStatus === 'active').length} active · {students.filter((s) => s.accountStatus === 'pending_activation').length} pending
              </div>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-700" />
                <span>Examination Scripts</span>
              </div>
              <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-1.5">
                {(data.attempts || []).length}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {(data.attempts || []).filter((a) => a.status === 'in_progress').length} live right now
              </div>
            </div>
          </div>

          {/* Teachers' Operations Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Teachers&apos; & Staff Operations ({teacherOps.length})
              </h3>
              <span className="text-xs text-slate-500">
                Assignments, question contributions & account controls
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="py-3 px-4">Staff ID & Name</th>
                    <th className="py-3 px-4">Role / Dept</th>
                    <th className="py-3 px-4">Assigned Classes & Subjects</th>
                    <th className="py-3 px-4 text-right">Questions (App / Total)</th>
                    <th className="py-3 px-4">Status</th>
                    {isAdmin && <th className="py-3 px-4 text-right">Account Control</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {teacherOps.map((row) => {
                    const isSelf = row.profileId === data.me.id;
                    const confirming = confirmDeleteStaffId === row.staffId;
                    return (
                      <tr key={row.staffId} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-mono-tabular font-semibold text-[#0A1E3D]">
                            {row.staffNumber}
                          </div>
                          <div className="font-medium text-slate-900 text-sm">{row.fullName}</div>
                          <div className="text-slate-500">{row.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{ROLE_LABELS[row.role]}</div>
                          <div className="text-slate-500">{row.departmentName}</div>
                        </td>
                        <td className="py-3 px-4">
                          {row.assignedPairs.length === 0 ? (
                            <span className="text-slate-400">No class assignments</span>
                          ) : (
                            <div className="space-y-0.5">
                              {row.assignedPairs.map((pair, idx) => (
                                <div key={idx} className="text-slate-700">
                                  <span className="font-semibold">{pair.className}</span> · {pair.subjectName}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono-tabular">
                          <span className="font-semibold text-emerald-700">{row.approvedQuestions}</span>
                          <span className="text-slate-400"> / </span>
                          <span className="font-semibold text-slate-900">{row.totalQuestions}</span>
                          {row.pendingQuestions > 0 && (
                            <div className="text-[11px] text-amber-700">
                              {row.pendingQuestions} pending
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-semibold">
                          <span className={row.isActive ? 'text-emerald-700' : 'text-red-700'}>
                            {row.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            {isSelf ? (
                              <span className="text-slate-400 font-medium">Current Session</span>
                            ) : confirming ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    await runAdminAction(
                                      'delete_staff',
                                      { staffId: row.staffId, profileId: row.profileId },
                                      `Removed staff member ${row.fullName} and revoked login credentials.`
                                    );
                                    setConfirmDeleteStaffId(null);
                                  }}
                                  className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white font-semibold rounded"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStaffId(null)}
                                  className="px-2 py-1 border border-slate-300 text-slate-700 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void runAdminAction(
                                      'update_staff_status',
                                      { profileId: row.profileId, isActive: !row.isActive },
                                      `${row.isActive ? 'Deactivated' : 'Reactivated'} ${row.fullName}.`
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded border font-medium ${
                                    row.isActive
                                      ? 'border-amber-300 text-amber-800 hover:bg-amber-50'
                                      : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                                  }`}
                                >
                                  {row.isActive ? 'Deactivate' : 'Reactivate'}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmDeleteStaffId(row.staffId)}
                                  className="px-2.5 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 font-medium inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Students' Operations Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900">
                Students&apos; Operations ({studentOps.length})
              </h3>
              <span className="text-xs text-slate-500">
                Class placement, live CBT progress & published performance
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="py-3 px-4">Admission No. & Student</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4 text-right">Attempts (Live)</th>
                    <th className="py-3 px-4 text-right">Mean Score</th>
                    <th className="py-3 px-4">Status</th>
                    {isAdmin && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {studentOps.map((stu) => (
                    <tr key={stu.studentId} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-mono-tabular font-semibold text-[#0A1E3D]">
                          {stu.admissionNumber}
                        </div>
                        <div className="font-medium text-slate-900 text-sm">{stu.fullName}</div>
                        <div className="text-slate-500">{stu.email}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">{stu.className}</td>
                      <td className="py-3 px-4 text-right font-mono-tabular">
                        {stu.attemptsCount}
                        {stu.inProgressCount > 0 && (
                          <span className="ml-1 text-emerald-700 font-semibold">
                            ({stu.inProgressCount} live)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900">
                        {stu.averageScorePercent !== null ? `${stu.averageScorePercent}%` : '—'}
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        <span
                          className={
                            stu.accountStatus === 'active'
                              ? 'text-emerald-700'
                              : stu.accountStatus === 'pending_activation'
                                ? 'text-amber-700'
                                : 'text-red-700'
                          }
                        >
                          {stu.accountStatus.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4 text-right">
                          {stu.accountStatus !== 'active' ? (
                            <button
                              type="button"
                              onClick={() =>
                                void runAdminAction(
                                  'update_student_status',
                                  { studentId: stu.studentId, accountStatus: 'active' },
                                  `Activated ${stu.admissionNumber}.`
                                )
                              }
                              className="px-2.5 py-1 bg-emerald-700 text-white font-semibold rounded"
                            >
                              Activate
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                void runAdminAction(
                                  'update_student_status',
                                  { studentId: stu.studentId, accountStatus: 'withdrawn' },
                                  `Deactivated ${stu.admissionNumber}.`
                                )
                              }
                              className="px-2.5 py-1 border border-red-300 text-red-700 rounded hover:bg-red-50"
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* STUDENTS MANAGEMENT */}
      {section === 'students' && (
        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Student Directory & Enrollment Management
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {students.length} total student(s) · {students.filter((s) => s.accountStatus === 'pending_activation').length} pending activation
              </p>
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAddStudent((v) => !v)}
                className="px-4 py-2 text-xs font-semibold bg-[#0A1E3D] text-white rounded-lg flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Add / Bulk Import Students</span>
              </button>
            )}
          </div>

          {showAddStudent && isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form
                onSubmit={handleCreateStudent}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Create Single Student Account
                </h3>
                <input
                  required
                  placeholder="Full Name"
                  value={newStuName}
                  onChange={(e) => setNewStuName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    type="email"
                    placeholder="Email Address"
                    value={newStuEmail}
                    onChange={(e) => setNewStuEmail(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Admission No (JBS/2026/020)"
                    value={newStuAdm}
                    onChange={(e) => setNewStuAdm(e.target.value)}
                    className="px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    aria-label="Student Class"
                    value={newStuClass}
                    onChange={(e) => setNewStuClass(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {data.classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    type="password"
                    minLength={8}
                    placeholder="Initial Password (min 8)"
                    value={newStuPassword}
                    onChange={(e) => setNewStuPassword(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
                >
                  Provision Active Student
                </button>
              </form>

              <form
                onSubmit={handleBulkStudents}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Bulk Student CSV Import
                </h3>
                <p className="text-xs text-slate-500">
                  Columns: fullName, email, admissionNumber, classId (e.g. cls_sss2), password
                </p>
                <textarea
                  rows={4}
                  required
                  value={bulkStuCsv}
                  onChange={(e) => setBulkStuCsv(e.target.value)}
                  placeholder="fullName,email,admissionNumber,classId,password"
                  className="w-full px-3 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 border border-[#0A1E3D] text-[#0A1E3D] text-xs font-semibold rounded-lg hover:bg-slate-50"
                >
                  Import Student CSV Batch
                </button>
              </form>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search student name or admission number..."
              value={stuSearch}
              onChange={(e) => setStuSearch(e.target.value)}
              className="flex-1 min-w-[220px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
            />
            <select
              aria-label="Filter students by class"
              value={stuClassFilter}
              onChange={(e) => setStuClassFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Classes</option>
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Admission No.</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4">Status</th>
                    {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredStudents.map((stu) => {
                    const prof = profiles.find((p) => p.id === stu.profileId);
                    const cls = data.classes.find((c) => c.id === stu.classId);
                    return (
                      <tr key={stu.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-[#0A1E3D]">
                          {stu.admissionNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">
                            {prof?.fullName}{' '}
                            {stu.isSampleData && (
                              <span className="text-[11px] font-normal text-slate-400">
                                · Sample Record
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{prof?.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {isAdmin ? (
                            <select
                              aria-label={`Change class for ${prof?.fullName}`}
                              value={stu.classId}
                              onChange={(e) =>
                                void runAdminAction(
                                  'promote_transfer_student',
                                  { studentId: stu.id, classId: e.target.value },
                                  'Student class updated.'
                                )
                              }
                              className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                            >
                              {data.classes.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            cls?.name
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          <span
                            className={
                              stu.accountStatus === 'active'
                                ? 'text-emerald-700'
                                : stu.accountStatus === 'pending_activation'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                            }
                          >
                            {stu.accountStatus.replace('_', ' ').toUpperCase()}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right space-x-2 whitespace-nowrap">
                            {stu.accountStatus !== 'active' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void runAdminAction(
                                    'update_student_status',
                                    { studentId: stu.id, accountStatus: 'active' },
                                    `Activated ${stu.admissionNumber}.`
                                  )
                                }
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded inline-flex items-center gap-1"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Activate</span>
                              </button>
                            )}
                            {stu.accountStatus === 'active' && (
                              <button
                                type="button"
                                onClick={() =>
                                  void runAdminAction(
                                    'update_student_status',
                                    { studentId: stu.id, accountStatus: 'withdrawn' },
                                    `Deactivated ${stu.admissionNumber}.`
                                  )
                                }
                                className="px-2.5 py-1 text-xs font-medium border border-red-300 text-red-700 rounded hover:bg-red-50"
                              >
                                Deactivate
                              </button>
                            )}
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
      )}

      {/* STAFF & PERMISSIONS */}
      {section === 'staff' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {isAdmin && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await runAdminAction(
                    'create_staff',
                    {
                      fullName: stfName,
                      email: stfEmail,
                      staffNumber: stfNumber,
                      role: stfRole,
                      departmentId: stfDept,
                      designation: stfDesig,
                      password: stfPassword,
                    },
                    `Staff account created for ${stfName}.`
                  );
                  setStfName('');
                  setStfEmail('');
                  setStfNumber('');
                  setStfDesig('');
                  setStfPassword('');
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Provision Staff Account
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Full Name"
                    value={stfName}
                    onChange={(e) => setStfName(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    required
                    placeholder="Staff ID (JBS/STF/010)"
                    value={stfNumber}
                    onChange={(e) => setStfNumber(e.target.value)}
                    className="px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    required
                    type="email"
                    placeholder="Official Email"
                    value={stfEmail}
                    onChange={(e) => setStfEmail(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <select
                    aria-label="Staff Role"
                    value={stfRole}
                    onChange={(e) => setStfRole(e.target.value as UserRole)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="teacher">Subject Teacher</option>
                    <option value="hod">Head of Department</option>
                    <option value="exam_officer">Examination Officer</option>
                    <option value="principal">Principal</option>
                    <option value="invigilator">Invigilator</option>
                    <option value="super_admin">Super Administrator</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    aria-label="Department"
                    value={stfDept}
                    onChange={(e) => setStfDept(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {data.departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    placeholder="Designation"
                    value={stfDesig}
                    onChange={(e) => setStfDesig(e.target.value)}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <input
                  required
                  type="password"
                  minLength={8}
                  placeholder="Initial Password (min 8 chars)"
                  value={stfPassword}
                  onChange={(e) => setStfPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
                >
                  Create Staff Account
                </button>
              </form>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAdminAction(
                  'assign_teacher',
                  {
                    staffId: assignStaffId,
                    classId: assignClassId,
                    subjectId: assignSubjectId,
                  },
                  'Teacher assigned to class and subject.'
                );
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-slate-900">
                Assign Teacher to Class & Subject
              </h3>
              <select
                aria-label="Select Teacher"
                value={assignStaffId}
                onChange={(e) => setAssignStaffId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {staffList.map((st) => {
                  const prof = profiles.find((p) => p.id === st.profileId);
                  return (
                    <option key={st.id} value={st.id}>
                      {prof?.fullName} ({st.staffNumber})
                    </option>
                  );
                })}
              </select>
              <select
                aria-label="Select Class"
                value={assignClassId}
                onChange={(e) => setAssignClassId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Select Subject"
                value={assignSubjectId}
                onChange={(e) => setAssignSubjectId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {data.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 border border-[#0A1E3D] text-[#0A1E3D] text-xs font-semibold rounded-lg hover:bg-slate-50"
              >
                Save Teaching Assignment
              </button>
            </form>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-sm font-bold text-slate-900">
                  Staff Roster, Roles & Account Termination Controls ({staffList.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Deactivate a staff member to suspend portal access temporarily, or permanently delete relieved staff and revoke all login credentials.
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Staff ID</th>
                    <th className="py-3 px-4">Name & Email</th>
                    <th className="py-3 px-4">Assigned Classes & Subjects</th>
                    <th className="py-3 px-4">Role / Permissions</th>
                    <th className="py-3 px-4">Status</th>
                    {isAdmin && <th className="py-3 px-4 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {staffList.map((st) => {
                    const prof = profiles.find((p) => p.id === st.profileId);
                    if (!prof) return null;
                    const isSelf = prof.id === data.me.id;
                    const confirming = confirmDeleteStaffId === st.id;
                    const staffAssignments = (data.teacherAssignments || []).filter(
                      (ta) => ta.staffId === st.id
                    );

                    return (
                      <tr key={st.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-[#0A1E3D]">
                          {st.staffNumber}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{prof.fullName}</div>
                          <div className="text-xs text-slate-500">
                            {prof.email} · {st.designation}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {staffAssignments.length === 0 ? (
                            <span className="text-slate-400">None assigned</span>
                          ) : (
                            <div className="space-y-1">
                              {staffAssignments.map((ta) => {
                                const cls = data.classes.find((c) => c.id === ta.classId);
                                const sub = data.subjects.find((s) => s.id === ta.subjectId);
                                return (
                                  <div
                                    key={ta.id}
                                    className="flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-0.5"
                                  >
                                    <span className="text-slate-700">
                                      <strong>{cls?.name}</strong> · {sub?.name}
                                    </span>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          void runAdminAction(
                                            'remove_teacher_assignment',
                                            { assignmentId: ta.id },
                                            `Removed ${cls?.name} · ${sub?.name} assignment.`
                                          )
                                        }
                                        className="text-red-600 hover:underline text-[11px]"
                                      >
                                        Remove
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          {isAdmin && !isSelf ? (
                            <select
                              aria-label={`Change role for ${prof.fullName}`}
                              value={prof.role}
                              onChange={(e) =>
                                void runAdminAction(
                                  'update_staff_role',
                                  { profileId: prof.id, role: e.target.value },
                                  `Updated role for ${prof.fullName}.`
                                )
                              }
                              className="px-2 py-1 border border-slate-300 rounded bg-white text-xs"
                            >
                              {(Object.keys(ROLE_LABELS) as UserRole[])
                                .filter((r) => r !== 'student')
                                .map((r) => (
                                  <option key={r} value={r}>
                                    {ROLE_LABELS[r]}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            ROLE_LABELS[prof.role]
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs font-semibold">
                          <span className={prof.isActive ? 'text-emerald-700' : 'text-red-700'}>
                            {prof.isActive ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="py-3 px-4 text-right text-xs whitespace-nowrap">
                            {isSelf ? (
                              <span className="text-slate-400 font-medium">Current Session</span>
                            ) : confirming ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    await runAdminAction(
                                      'delete_staff',
                                      { staffId: st.id, profileId: prof.id },
                                      `Permanently deleted ${prof.fullName} and revoked login credentials.`
                                    );
                                    setConfirmDeleteStaffId(null);
                                  }}
                                  className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white font-semibold rounded"
                                >
                                  Confirm Delete
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteStaffId(null)}
                                  className="px-2 py-1 border border-slate-300 text-slate-700 rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void runAdminAction(
                                      'update_staff_status',
                                      { profileId: prof.id, isActive: !prof.isActive },
                                      `${prof.isActive ? 'Deactivated' : 'Reactivated'} ${prof.fullName}.`
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded border font-medium inline-flex items-center gap-1 ${
                                    prof.isActive
                                      ? 'border-amber-300 text-amber-800 hover:bg-amber-50'
                                      : 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
                                  }`}
                                >
                                  {prof.isActive ? (
                                    <>
                                      <UserX className="w-3 h-3" />
                                      <span>Deactivate</span>
                                    </>
                                  ) : (
                                    <>
                                      <UserCheck className="w-3 h-3" />
                                      <span>Reactivate</span>
                                    </>
                                  )}
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => setConfirmDeleteStaffId(st.id)}
                                  className="px-2.5 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 font-medium inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete Staff</span>
                                </button>
                              </div>
                            )}
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
      )}

      {/* ACADEMIC STRUCTURE (Departments, Classes, Subjects, Sessions & Terms) */}
      {section === 'academics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAdminAction(
                  'create_department',
                  { name: deptName, code: deptCode, description: `${deptName} academic division.` },
                  `Department ${deptName} added.`
                );
                setDeptName('');
                setDeptCode('');
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-slate-900">Add Department</h3>
              <input
                required
                placeholder="Department Name"
                value={deptName}
                onChange={(e) => setDeptName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                required
                placeholder="Code (e.g. VOC)"
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
              />
              <button type="submit" className="w-full py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg">
                Create Department
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAdminAction(
                  'create_subject',
                  {
                    name: subName,
                    code: subCode,
                    departmentId: subDeptId,
                    levelGroup: subLevel,
                    applicableClassIds: data.classes
                      .filter((c) => c.levelGroup === subLevel)
                      .map((c) => c.id),
                  },
                  `Subject ${subName} created.`
                );
                setSubName('');
                setSubCode('');
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-slate-900">Add Curriculum Subject</h3>
              <input
                required
                placeholder="Subject Title (e.g. Further Mathematics)"
                value={subName}
                onChange={(e) => setSubName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="Code (SSS-FMTH)"
                  value={subCode}
                  onChange={(e) => setSubCode(e.target.value)}
                  className="px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                />
                <select
                  aria-label="Level Group"
                  value={subLevel}
                  onChange={(e) =>
                    setSubLevel(e.target.value as 'primary' | 'junior_secondary' | 'senior_secondary')
                  }
                  className="px-2 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="primary">Primary 1–6</option>
                  <option value="junior_secondary">JSS 1–3</option>
                  <option value="senior_secondary">SSS 1–3</option>
                </select>
              </div>
              <select
                aria-label="Subject Department"
                value={subDeptId}
                onChange={(e) => setSubDeptId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {data.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="w-full py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg">
                Create Subject
              </button>
            </form>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await runAdminAction(
                  'create_session',
                  { name: sessName, startDate: sessStart, endDate: sessEnd },
                  `Academic session ${sessName} created.`
                );
                setSessName('');
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
            >
              <h3 className="font-display text-sm font-bold text-slate-900">
                Academic Session & Active Term
              </h3>
              <input
                required
                placeholder="e.g. 2027/2028 Academic Session"
                value={sessName}
                onChange={(e) => setSessName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={sessStart}
                  onChange={(e) => setSessStart(e.target.value)}
                  className="px-2 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                />
                <input
                  type="date"
                  value={sessEnd}
                  onChange={(e) => setSessEnd(e.target.value)}
                  className="px-2 py-2 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg">
                Add Session (with 3 Terms)
              </button>
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <div className="text-xs font-medium text-slate-700">Switch Current Term:</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.terms.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() =>
                        void runAdminAction(
                          'set_current_session_term',
                          { sessionId: t.sessionId, termId: t.id },
                          `Active term switched to ${t.name}.`
                        )
                      }
                      className={`px-2.5 py-1 text-xs rounded border ${
                        t.isCurrent
                          ? 'bg-[#0A1E3D] text-white border-[#0A1E3D]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            </form>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                Academic Classes (Primary 1 to SSS 3)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {data.classes.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="font-semibold text-slate-900">{c.name}</div>
                    <div className="font-mono-tabular text-slate-500 mt-0.5">
                      {c.code} · {students.filter((s) => s.classId === c.id).length} students
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="font-display text-sm font-bold text-slate-900 mb-3">
                Curriculum Subjects ({data.subjects.length})
              </h3>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 text-xs">
                {data.subjects.map((sub) => (
                  <div key={sub.id} className="py-2 flex items-center justify-between">
                    <span className="font-medium text-slate-900">{sub.name}</span>
                    <span className="font-mono-tabular text-slate-500">{sub.code}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SCHOOL BRANDING & SYSTEM SETTINGS */}
      {section === 'settings' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await runAdminAction(
              'update_settings',
              {
                schoolName,
                motto,
                address,
                phone,
                defaultInstructions,
                gradingScale,
                allowStudentSelfRegistration: allowSelfReg,
                requireAdminApprovalForStudents: requireApproval,
                allowPartialMultipleSelect: allowPartialMs,
              },
              'School settings and grading scale saved.'
            );
          }}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex items-center gap-2 text-base font-bold text-slate-900 border-b border-slate-200 pb-3">
            <Settings className="w-4 h-4 text-[#0A1E3D]" />
            <span>Juneberries Branding, Grading Scale & Examination Policies</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Name</label>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Motto</label>
              <input
                value={motto}
                onChange={(e) => setMotto(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Campus Address</label>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Default Examination Instructions
            </label>
            <textarea
              rows={2}
              value={defaultInstructions}
              onChange={(e) => setDefaultInstructions(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900">Configurable Grading Scale</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {gradingScale.map((band, idx) => (
                <div key={band.grade} className="p-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center gap-2 text-xs">
                  <span className="font-mono-tabular font-bold text-[#0A1E3D] w-6">{band.grade}</span>
                  <input
                    type="number"
                    aria-label={`Min score for ${band.grade}`}
                    value={band.minScore}
                    onChange={(e) => {
                      const copy = [...gradingScale];
                      copy[idx] = { ...band, minScore: Number(e.target.value) };
                      setGradingScale(copy);
                    }}
                    className="w-14 px-2 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                  <span>–</span>
                  <input
                    type="number"
                    aria-label={`Max score for ${band.grade}`}
                    value={band.maxScore}
                    onChange={(e) => {
                      const copy = [...gradingScale];
                      copy[idx] = { ...band, maxScore: Number(e.target.value) };
                      setGradingScale(copy);
                    }}
                    className="w-14 px-2 py-1 bg-white border border-slate-300 rounded font-mono-tabular"
                  />
                  <input
                    aria-label={`Remark for ${band.grade}`}
                    value={band.remark}
                    onChange={(e) => {
                      const copy = [...gradingScale];
                      copy[idx] = { ...band, remark: e.target.value };
                      setGradingScale(copy);
                    }}
                    className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-6 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowSelfReg} onChange={(e) => setAllowSelfReg(e.target.checked)} />
              <span>Allow Student Self-Registration</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={requireApproval} onChange={(e) => setRequireApproval(e.target.checked)} />
              <span>Require Admin Activation for Self-Registered Students</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allowPartialMs} onChange={(e) => setAllowPartialMs(e.target.checked)} />
              <span>Allow Partial Credit on Multiple-Select Questions</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-[#0A1E3D] text-white text-sm font-semibold rounded-lg flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            <span>Save Institutional Configuration</span>
          </button>
        </form>
      )}

      {/* AUDIT LOGS */}
      {section === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#0A1E3D]" />
            <h2 className="font-display text-base font-bold text-slate-900">
              System Security & Action Audit Trail
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(data.auditLogs || []).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">
                      {log.actorName} · {ROLE_LABELS[log.actorRole]}
                    </td>
                    <td className="py-2.5 px-4 font-mono-tabular font-semibold text-[#0A1E3D]">
                      {log.action}
                    </td>
                    <td className="py-2.5 px-4 text-slate-700">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ANNOUNCEMENTS */}
      {section === 'announcements' && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await runAdminAction(
              'broadcast_announcement',
              { title: annTitle, message: annMsg, targetRole: annRole },
              'Announcement broadcast to selected recipients.'
            );
            setAnnTitle('');
            setAnnMsg('');
          }}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 max-w-2xl"
        >
          <div className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Bell className="w-4 h-4 text-[#B8860B]" />
            <span>Broadcast School Examination Announcement</span>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Target Audience</label>
            <select
              value={annRole}
              onChange={(e) => setAnnRole(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="all">All Active Portal Users</option>
              <option value="student">All Students</option>
              <option value="teacher">All Subject Teachers</option>
              <option value="invigilator">All Invigilators</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
            <input
              required
              value={annTitle}
              onChange={(e) => setAnnTitle(e.target.value)}
              placeholder="e.g. First Term CBT Examination Timetable Published"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Message</label>
            <textarea
              required
              rows={3}
              value={annMsg}
              onChange={(e) => setAnnMsg(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-[#0A1E3D] text-white text-sm font-semibold rounded-lg"
          >
            Send Notification
          </button>
        </form>
      )}
    </div>
  );
}
