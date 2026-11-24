'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert } from 'lucide-react';
import type { PortalBootstrapData } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';

interface LiveMonitoringProps {
  data: PortalBootstrapData;
  onRefresh: () => Promise<void>;
}

export default function LiveMonitoring({ data, onRefresh }: LiveMonitoringProps) {
  const exams = data.examinations || [];
  const attempts = data.attempts || [];
  const students = data.students || [];
  const profiles = data.profiles || [];
  const incidents = data.incidents || [];

  const [selectedExamId, setSelectedExamId] = useState<string>(exams[0]?.id || '');
  const [incidentStudentId, setIncidentStudentId] = useState<string>('');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [reporting, setReporting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Live refresh every 6 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
      void onRefresh();
    }, 6000);
    return () => clearInterval(timer);
  }, [onRefresh]);

  const activeExam = exams.find((e) => e.id === selectedExamId) || exams[0];

  const monitoringRows = useMemo(() => {
    if (!activeExam) return [];
    const registeredIds = new Set(
      activeExam.assignedStudentIds.length > 0
        ? activeExam.assignedStudentIds
        : students.filter((s) => s.classId === activeExam.classId).map((s) => s.id)
    );

    return Array.from(registeredIds).map((stuId) => {
      const stu = students.find((s) => s.id === stuId);
      const prof = stu ? profiles.find((p) => p.id === stu.profileId) : undefined;
      const att = attempts.find(
        (a) => a.examinationId === activeExam.id && a.studentId === stuId
      );

      let displayState = 'Not Started';
      if (att) {
        if (att.status === 'submitted' || att.status === 'graded') {
          displayState = 'Submitted';
        } else if (att.status === 'time_expired') {
          displayState = 'Time Expired';
        } else if (att.status === 'in_progress') {
          const lastActMs = new Date(att.lastActivityAt).getTime();
          const stale = nowMs - lastActMs > 90000;
          displayState = stale ? 'Disconnected / Stale' : 'In Progress';
        }
      }

      return {
        studentId: stuId,
        admissionNumber: stu?.admissionNumber || stuId,
        studentName: prof?.fullName || 'Student',
        attempt: att,
        displayState,
      };
    });
  }, [activeExam, students, profiles, attempts, nowMs]);

  const summary = useMemo(() => {
    return {
      registered: monitoringRows.length,
      started: monitoringRows.filter((r) => r.attempt).length,
      notStarted: monitoringRows.filter((r) => !r.attempt).length,
      inProgress: monitoringRows.filter((r) => r.displayState === 'In Progress').length,
      disconnected: monitoringRows.filter((r) => r.displayState === 'Disconnected / Stale').length,
      submitted: monitoringRows.filter((r) => r.displayState === 'Submitted').length,
      expired: monitoringRows.filter((r) => r.displayState === 'Time Expired').length,
    };
  }, [monitoringRows]);

  const handleReportIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExam || !incidentDesc.trim()) return;
    setReporting(true);
    try {
      await apiFetch('/api/cbt', {
        method: 'POST',
        body: JSON.stringify({
          action: 'record_incident',
          payload: {
            examinationId: activeExam.id,
            studentId: incidentStudentId || undefined,
            eventType: 'invigilator_report',
            description: incidentDesc.trim(),
          },
        }),
      });
      setIncidentDesc('');
      setFeedback('Examination incident logged to official invigilation audit trail.');
      await onRefresh();
    } finally {
      setReporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-lg font-bold text-slate-900">
            Live Examination Monitoring & Invigilation
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time candidate progress, connection health, and browser focus telemetry
          </p>
        </div>

        <div className="flex items-center gap-3">
          <select
            aria-label="Select examination to monitor"
            value={activeExam?.id || ''}
            onChange={(e) => setSelectedExamId(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.status})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void onRefresh()}
            className="px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync Now</span>
          </button>
        </div>
      </div>

      {/* Summary Counts */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'Registered', value: summary.registered },
          { label: 'Not Started', value: summary.notStarted },
          { label: 'In Progress', value: summary.inProgress },
          { label: 'Disconnected', value: summary.disconnected },
          { label: 'Submitted', value: summary.submitted },
          { label: 'Time Expired', value: summary.expired },
        ].map((item) => (
          <div key={item.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="text-xs text-slate-500">{item.label}</div>
            <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D] mt-1">
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* Candidate Roster Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4">Admission No.</th>
                <th className="py-3 px-4">Candidate</th>
                <th className="py-3 px-4">Live Status</th>
                <th className="py-3 px-4">Started / Last Activity</th>
                <th className="py-3 px-4 text-right">Tab Switches</th>
                <th className="py-3 px-4 text-right">Network Drops</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {monitoringRows.map((row) => (
                <tr key={row.studentId} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono-tabular text-xs font-semibold text-[#0A1E3D]">
                    {row.admissionNumber}
                  </td>
                  <td className="py-3 px-4 font-medium text-slate-900">{row.studentName}</td>
                  <td className="py-3 px-4 text-xs font-semibold">
                    <span
                      className={
                        row.displayState === 'Submitted'
                          ? 'text-emerald-700'
                          : row.displayState === 'In Progress'
                            ? 'text-sky-700'
                            : row.displayState.includes('Disconnected') ||
                                row.displayState === 'Time Expired'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                      }
                    >
                      {row.displayState}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-xs font-mono-tabular text-slate-600">
                    {row.attempt
                      ? `${new Date(row.attempt.startedAt).toLocaleTimeString()} · ${new Date(
                          row.attempt.lastActivityAt
                        ).toLocaleTimeString()}`
                      : '—'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-xs">
                    {row.attempt?.tabVisibilityChanges ?? 0}
                  </td>
                  <td className="py-3 px-4 text-right font-mono-tabular text-xs">
                    {row.attempt?.connectionInterruptions ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invigilator Incident Reporting & Event Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleReportIncident}
          className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <ShieldAlert className="w-4 h-4 text-[#B8860B]" />
            <span>Record Invigilation Incident</span>
          </div>
          {feedback && (
            <div className="p-2.5 text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 rounded">
              {feedback}
            </div>
          )}
          <div>
            <label htmlFor="inc-stu" className="block text-xs font-medium text-slate-700 mb-1">
              Candidate (optional)
            </label>
            <select
              id="inc-stu"
              value={incidentStudentId}
              onChange={(e) => setIncidentStudentId(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">General Hall Observation</option>
              {monitoringRows.map((r) => (
                <option key={r.studentId} value={r.studentId}>
                  {r.studentName} ({r.admissionNumber})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="inc-desc" className="block text-xs font-medium text-slate-700 mb-1">
              Incident Notes
            </label>
            <textarea
              id="inc-desc"
              required
              rows={3}
              value={incidentDesc}
              onChange={(e) => setIncidentDesc(e.target.value)}
              placeholder="Describe workstation swap, unauthorized materials, or technical interruption..."
              className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={reporting || !activeExam}
            className="w-full py-2 px-4 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
          >
            {reporting ? 'Recording...' : 'Submit Incident Report'}
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900">
            Recorded Security & Session Events ({incidents.length})
          </h3>
          {incidents.length === 0 ? (
            <p className="text-xs text-slate-500 py-6 text-center">
              No tab switches, network drops, or invigilation incidents recorded for this examination.
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
              {incidents.map((inc) => {
                const stu = students.find((s) => s.id === inc.studentId);
                return (
                  <div key={inc.id} className="py-2.5 flex items-start gap-2.5 text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="font-semibold text-slate-800">
                        {inc.eventType.replace('_', ' ').toUpperCase()}
                        {stu ? ` · ${stu.admissionNumber}` : ''}
                      </div>
                      <div className="text-slate-600">{inc.description}</div>
                      <div className="text-slate-400 font-mono-tabular mt-0.5">
                        {new Date(inc.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
