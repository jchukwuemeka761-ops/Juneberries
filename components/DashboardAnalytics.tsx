'use client';

import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PortalBootstrapData } from '@/lib/api-client';

interface DashboardAnalyticsProps {
  data: PortalBootstrapData;
}

const CHART_COLORS = ['#0A1E3D', '#163A70', '#B8860B', '#0284C7', '#15803D', '#64748B'];

export default function DashboardAnalytics({ data }: DashboardAnalyticsProps) {
  const [filterClassId, setFilterClassId] = useState<string>('all');
  const [filterDeptId, setFilterDeptId] = useState<string>('all');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('all');

  const students = data.students || [];
  const staff = data.staff || [];
  const examinations = data.examinations || [];
  const questions = data.questions || [];
  const results = data.results || [];
  const attempts = data.attempts || [];

  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (filterClassId !== 'all' && r.classId !== filterClassId) return false;
      if (filterSubjectId !== 'all' && r.subjectId !== filterSubjectId) return false;
      if (filterDeptId !== 'all') {
        const sub = data.subjects.find((s) => s.id === r.subjectId);
        if (sub?.departmentId !== filterDeptId) return false;
      }
      return true;
    });
  }, [results, filterClassId, filterSubjectId, filterDeptId, data.subjects]);

  const kpis = useMemo(() => {
    const activeExams = examinations.filter((e) => e.status === 'active').length;
    const scheduledExams = examinations.filter((e) => e.status === 'scheduled').length;
    const completedExams = examinations.filter((e) => e.status === 'closed').length;
    const pendingQuestions = questions.filter(
      (q) => q.approvalStatus === 'submitted' || q.approvalStatus === 'under_review'
    ).length;
    const resultsAwaitingApproval = results.filter(
      (r) => r.status === 'pending_review' || r.status === 'approved'
    ).length;
    const avgScore =
      filteredResults.length > 0
        ? Math.round(
            (filteredResults.reduce((acc, r) => acc + r.percentage, 0) /
              filteredResults.length) *
              10
          ) / 10
        : 0;

    return {
      totalStudents: students.length,
      totalTeachers: staff.filter((s) => {
        const prof = data.profiles?.find((p) => p.id === s.profileId);
        return prof?.role === 'teacher' || prof?.role === 'hod';
      }).length,
      totalSubjects: data.subjects.length,
      totalClasses: data.classes.length,
      totalDepartments: data.departments.length,
      totalExams: examinations.length,
      activeExams,
      scheduledExams,
      completedExams,
      pendingQuestions,
      submittedScripts: attempts.filter((a) => a.status !== 'in_progress' && a.status !== 'not_started').length,
      resultsAwaitingApproval,
      avgScore,
    };
  }, [students, staff, examinations, questions, results, attempts, filteredResults, data]);

  const populationByClass = useMemo(() => {
    return data.classes
      .map((cls) => ({
        name: cls.code,
        fullName: cls.name,
        students: students.filter((s) => s.classId === cls.id).length,
      }))
      .filter((row) => row.students > 0 || filterClassId === 'all');
  }, [data.classes, students, filterClassId]);

  const subjectPerformance = useMemo(() => {
    const grouped = new Map<string, { total: number; count: number }>();
    for (const r of filteredResults) {
      const curr = grouped.get(r.subjectId) || { total: 0, count: 0 };
      curr.total += r.percentage;
      curr.count += 1;
      grouped.set(r.subjectId, curr);
    }
    return Array.from(grouped.entries()).map(([subjectId, val]) => {
      const sub = data.subjects.find((s) => s.id === subjectId);
      return {
        subject: sub?.code || subjectId,
        average: Math.round((val.total / val.count) * 10) / 10,
        scripts: val.count,
      };
    });
  }, [filteredResults, data.subjects]);

  const passFailDistribution = useMemo(() => {
    const passed = filteredResults.filter((r) => r.passed).length;
    const failed = filteredResults.filter((r) => !r.passed).length;
    return [
      { name: 'Passed', value: passed },
      { name: 'Below Pass Mark', value: failed },
    ];
  }, [filteredResults]);

  const teacherActivity = useMemo(() => {
    const byTeacher = new Map<string, number>();
    for (const q of questions) {
      byTeacher.set(q.teacherProfileId, (byTeacher.get(q.teacherProfileId) || 0) + 1);
    }
    return Array.from(byTeacher.entries()).map(([profId, count]) => {
      const prof = data.profiles?.find((p) => p.id === profId);
      return {
        teacher: prof?.fullName || 'Teacher',
        questions: count,
      };
    });
  }, [questions, data.profiles]);

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">
            Live Institutional Analytics
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Calculated in real time from active school records · {data.sessions.find((s) => s.isCurrent)?.name} ·{' '}
            {data.terms.find((t) => t.isCurrent)?.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter analytics by department"
            value={filterDeptId}
            onChange={(e) => setFilterDeptId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All Departments</option>
            {data.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter analytics by class"
            value={filterClassId}
            onChange={(e) => setFilterClassId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All Classes (Pry 1–SSS 3)</option>
            {data.classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter analytics by subject"
            value={filterSubjectId}
            onChange={(e) => setFilterSubjectId(e.target.value)}
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700"
          >
            <option value="all">All Subjects</option>
            {data.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Students', value: kpis.totalStudents, sub: `${kpis.totalClasses} classes` },
          { label: 'Teaching Staff', value: kpis.totalTeachers, sub: `${kpis.totalDepartments} departments` },
          { label: 'Active Subjects', value: kpis.totalSubjects, sub: 'Primary to SSS 3' },
          { label: 'Examinations', value: kpis.totalExams, sub: `${kpis.activeExams} active · ${kpis.scheduledExams} scheduled` },
          { label: 'Pending Questions', value: kpis.pendingQuestions, sub: 'Awaiting HOD/Admin approval' },
          { label: 'Mean Score', value: `${kpis.avgScore}%`, sub: `${kpis.submittedScripts} submitted · ${kpis.resultsAwaitingApproval} pending` },
        ].map((card) => (
          <div
            key={card.label}
            className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between"
          >
            <div className="text-xs font-medium text-slate-500">{card.label}</div>
            <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-2">
              {card.value}
            </div>
            <div className="text-xs text-slate-500 mt-1 leading-snug">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Student Enrolment Distribution by Class
            </h3>
            <span className="text-xs text-slate-500 font-mono-tabular">
              {students.length} total students
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={populationByClass} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#475569' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                <Tooltip />
                <Bar dataKey="students" fill="#0A1E3D" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-sm font-semibold text-slate-900">
              Examination Pass / Fail Ratio
            </h3>
            <span className="text-xs text-slate-500 font-mono-tabular">
              {filteredResults.length} graded scripts
            </span>
          </div>
          {filteredResults.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-sm text-slate-500 text-center px-6">
              No graded examination results match the selected filters yet.
            </div>
          ) : (
            <div className="h-64 w-full flex items-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={passFailDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={3}
                  >
                    <Cell fill="#15803D" />
                    <Cell fill="#DC2626" />
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Subject Performance & Teacher Question Bank Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-display text-sm font-semibold text-slate-900 mb-4">
            Average Score by Subject (%)
          </h3>
          {subjectPerformance.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-slate-500">
              Complete and grade examinations to populate subject averages.
            </div>
          ) : (
            <div className="h-52 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={subjectPerformance} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis dataKey="subject" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Bar dataKey="average" fill="#B8860B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="font-display text-sm font-semibold text-slate-900 mb-4">
            Teacher Question Bank Contributions
          </h3>
          {teacherActivity.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-slate-500">
              No question bank entries recorded yet.
            </div>
          ) : (
            <div className="space-y-3">
              {teacherActivity.map((item, idx) => (
                <div key={item.teacher} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                    />
                    <span className="font-medium text-slate-800">{item.teacher}</span>
                  </div>
                  <span className="font-mono-tabular text-xs font-semibold text-slate-700">
                    {item.questions} question{item.questions === 1 ? '' : 's'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
