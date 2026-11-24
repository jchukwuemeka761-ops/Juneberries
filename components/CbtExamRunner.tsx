'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Flag,
  Maximize2,
  Send,
  Wifi,
  WifiOff,
  ZoomIn,
} from 'lucide-react';
import type { PortalBootstrapData, StartExamResponse } from '@/lib/api-client';
import { apiFetch } from '@/lib/api-client';
import type {
  Examination,
  ExaminationAttempt,
  ExaminationResult,
  SanitizedQuestion,
} from '@/lib/types';
import { QUESTION_TYPE_LABELS } from '@/lib/types';

interface CbtExamRunnerProps {
  data: PortalBootstrapData;
  examination: Examination;
  onExit: () => Promise<void>;
}

type AnswerValue = string | string[] | Record<string, string> | null;

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

function isAnswered(val: AnswerValue): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'string') return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  if (typeof val === 'object') return Object.values(val).some((v) => v && v.trim() !== '');
  return false;
}

export default function CbtExamRunner({
  data,
  examination,
  onExit,
}: CbtExamRunnerProps) {
  const student = data.studentRecord;
  const studentClass = data.classes.find((c) => c.id === examination.classId);
  const subject = data.subjects.find((s) => s.id === examination.subjectId);

  const [phase, setPhase] = useState<'ready' | 'active' | 'submitted'>('ready');
  const [readinessConfirmed, setReadinessConfirmed] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [attempt, setAttempt] = useState<ExaminationAttempt | null>(null);
  const [questions, setQuestions] = useState<SanitizedQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answersMap, setAnswersMap] = useState<Record<string, AnswerValue>>({});
  const [flaggedMap, setFlaggedMap] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState<number>(
    examination.durationMinutes * 60
  );

  const [syncState, setSyncState] = useState<'saved' | 'saving' | 'offline_queued'>('saved');
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [warningBanner, setWarningBanner] = useState<string | null>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zoomDiagram, setZoomDiagram] = useState(false);

  const [submissionOutcome, setSubmissionOutcome] = useState<{
    resultPublished: boolean;
    result: ExaminationResult | null;
    status: string;
  } | null>(null);

  const pendingQueueRef = useRef<
    Map<string, { questionId: string; response?: AnswerValue; flaggedForReview?: boolean }>
  >(new Map());
  const textDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSubmittedRef = useRef(false);

  const existingInProgress = useMemo(() => {
    return (data.attempts || []).find(
      (a) => a.examinationId === examination.id && a.status === 'in_progress'
    );
  }, [data.attempts, examination.id]);

  const flushPendingSaves = useCallback(
    async (attemptId: string) => {
      if (pendingQueueRef.current.size === 0) return;
      const entries = Array.from(pendingQueueRef.current.values());
      setSyncState('saving');
      for (const item of entries) {
        try {
          const res = await apiFetch<{ remainingSeconds?: number }>('/api/cbt', {
            method: 'POST',
            body: JSON.stringify({
              action: 'save_answer',
              payload: {
                attemptId,
                questionId: item.questionId,
                response: item.response,
                flaggedForReview: item.flaggedForReview,
              },
            }),
          });
          pendingQueueRef.current.delete(item.questionId);
          if (typeof res.remainingSeconds === 'number') {
            setRemainingSeconds(res.remainingSeconds);
          }
        } catch {
          setSyncState('offline_queued');
          return;
        }
      }
      setSyncState('saved');
    },
    []
  );

  const handleStartOrResume = useCallback(async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await apiFetch<StartExamResponse>('/api/cbt', {
        method: 'POST',
        body: JSON.stringify({
          action: 'start_exam',
          payload: { examinationId: examination.id },
        }),
      });
      setAttempt(res.attempt);
      setQuestions(res.questions);
      setRemainingSeconds(res.remainingSeconds);

      const initialAnswers: Record<string, AnswerValue> = {};
      const initialFlags: Record<string, boolean> = {};
      for (const ans of res.answers) {
        initialAnswers[ans.questionId] = ans.response;
        initialFlags[ans.questionId] = ans.flaggedForReview;
      }
      setAnswersMap(initialAnswers);
      setFlaggedMap(initialFlags);
      setPhase('active');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enter examination.');
    } finally {
      setStarting(false);
    }
  }, [examination.id]);

  // If resuming an already active attempt after browser refresh, auto-resume cleanly
  useEffect(() => {
    if (!existingInProgress || phase !== 'ready') return;
    let cancelled = false;
    apiFetch<StartExamResponse>('/api/cbt', {
      method: 'POST',
      body: JSON.stringify({
        action: 'start_exam',
        payload: { examinationId: examination.id },
      }),
    })
      .then((res) => {
        if (cancelled) return;
        setAttempt(res.attempt);
        setQuestions(res.questions);
        setRemainingSeconds(res.remainingSeconds);
        const initialAnswers: Record<string, AnswerValue> = {};
        const initialFlags: Record<string, boolean> = {};
        for (const ans of res.answers) {
          initialAnswers[ans.questionId] = ans.response;
          initialFlags[ans.questionId] = ans.flaggedForReview;
        }
        setAnswersMap(initialAnswers);
        setFlaggedMap(initialFlags);
        setPhase('active');
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to resume examination.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [existingInProgress, phase, examination.id]);

  const handleFinalSubmit = useCallback(
    async (reason: 'submitted' | 'time_expired') => {
      if (!attempt || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        await flushPendingSaves(attempt.id);
        const res = await apiFetch<{
          attempt: ExaminationAttempt;
          resultPublished: boolean;
          result: ExaminationResult | null;
        }>('/api/cbt', {
          method: 'POST',
          body: JSON.stringify({
            action: 'submit_exam',
            payload: { attemptId: attempt.id, reason },
          }),
        });
        setShowSubmitModal(false);
        setSubmissionOutcome({
          resultPublished: res.resultPublished,
          result: res.result,
          status: res.attempt.status,
        });
        setPhase('submitted');
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Submission failed. Please verify connectivity and retry.'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [attempt, flushPendingSaves, submitting]
  );

  // Server-deadline synchronized timer
  useEffect(() => {
    if (phase !== 'active' || !attempt) return;

    const timer = setInterval(() => {
      const serverDeadlineMs = new Date(attempt.deadlineAt).getTime();
      const left = Math.max(0, Math.floor((serverDeadlineMs - Date.now()) / 1000));
      setRemainingSeconds(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        void handleFinalSubmit('time_expired');
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [phase, attempt, handleFinalSubmit]);

  // Periodic recovery sync + heartbeat every 20s
  useEffect(() => {
    if (phase !== 'active' || !attempt) return;
    const interval = setInterval(async () => {
      await flushPendingSaves(attempt.id);
      try {
        const hb = await apiFetch<{ remainingSeconds?: number }>('/api/cbt', {
          method: 'POST',
          body: JSON.stringify({
            action: 'heartbeat',
            payload: { attemptId: attempt.id },
          }),
        });
        if (typeof hb.remainingSeconds === 'number') {
          setRemainingSeconds(hb.remainingSeconds);
        }
      } catch {
        // Ignore transient heartbeat errors
      }
    }, 20000);
    return () => clearInterval(interval);
  }, [phase, attempt, flushPendingSaves]);

  // Network online/offline listeners + retry
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (attempt) void flushPendingSaves(attempt.id);
    };
    const onOffline = () => {
      setIsOnline(false);
      setSyncState('offline_queued');
      if (attempt) {
        void apiFetch('/api/cbt', {
          method: 'POST',
          body: JSON.stringify({
            action: 'record_incident',
            payload: {
              examinationId: examination.id,
              attemptId: attempt.id,
              eventType: 'network_drop',
              description: 'Client browser lost network connectivity during CBT session.',
            },
          }),
        }).catch(() => {});
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [attempt, examination.id, flushPendingSaves]);

  // Browser visibility / focus monitoring
  useEffect(() => {
    if (phase !== 'active' || !attempt) return;
    const onVisibilityChange = () => {
      if (document.hidden) {
        setWarningBanner(
          'Examination focus warning: Tab switching is logged for invigilation review. Please remain inside the examination window.'
        );
        void apiFetch('/api/cbt', {
          method: 'POST',
          body: JSON.stringify({
            action: 'record_incident',
            payload: {
              examinationId: examination.id,
              attemptId: attempt.id,
              eventType: 'tab_switch',
              description: 'Candidate switched browser tab or minimized window.',
            },
          }),
        }).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [phase, attempt, examination.id]);

  const queueAndSaveAnswer = (
    questionId: string,
    nextResponse: AnswerValue,
    nextFlag: boolean,
    debounce: boolean
  ) => {
    if (!attempt) return;
    pendingQueueRef.current.set(questionId, {
      questionId,
      response: nextResponse,
      flaggedForReview: nextFlag,
    });
    setSyncState('saving');

    if (textDebounceRef.current) {
      clearTimeout(textDebounceRef.current);
    }

    if (debounce) {
      textDebounceRef.current = setTimeout(() => {
        void flushPendingSaves(attempt.id);
      }, 450);
    } else {
      void flushPendingSaves(attempt.id);
    }
  };

  const currentQuestion = questions[currentIndex];
  const answeredCount = questions.filter((q) => isAnswered(answersMap[q.id])).length;
  const flaggedCount = questions.filter((q) => flaggedMap[q.id]).length;
  const unansweredCount = questions.length - answeredCount;

  const requestFullscreen = () => {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  // PHASE 1: READINESS & INSTRUCTIONS
  if (phase === 'ready') {
    return (
      <div className="max-w-3xl mx-auto bg-white border border-slate-200 rounded-xl p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <img
              src={data.settings.logoUrl || '/images/juneberry_crest.jpg'}
              alt="Juneberry Crest"
              referrerPolicy="no-referrer"
              className="w-10 h-10 rounded-md object-cover border border-slate-200"
            />
            <div>
              <h2 className="font-display text-xl font-bold text-[#0A1E3D]">
                {examination.title}
              </h2>
              <p className="text-xs text-slate-600 mt-0.5">
                {subject?.name} · {studentClass?.name} · {examination.durationMinutes} minutes · {examination.totalMarks} marks
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void onExit()}
            className="text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Back to Exams
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs">
          <div>
            <div className="text-slate-500">Candidate Name</div>
            <div className="font-semibold text-slate-900 mt-0.5">{data.me.fullName}</div>
          </div>
          <div>
            <div className="text-slate-500">Admission No.</div>
            <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
              {student?.admissionNumber}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Questions</div>
            <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
              {examination.questionCount} items
            </div>
          </div>
          <div>
            <div className="text-slate-500">Pass Mark</div>
            <div className="font-mono-tabular font-semibold text-slate-900 mt-0.5">
              {examination.passMarkPercent}%
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Examination Instructions
          </h3>
          <div className="text-sm text-slate-700 leading-relaxed bg-white border border-slate-200 rounded-lg p-4">
            {examination.instructions}
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            {error}
          </div>
        )}

        <label className="flex items-start gap-3 p-4 rounded-lg border border-slate-200 cursor-pointer hover:bg-slate-50">
          <input
            type="checkbox"
            checked={readinessConfirmed}
            onChange={(e) => setReadinessConfirmed(e.target.checked)}
            className="mt-1 rounded border-slate-300"
          />
          <span className="text-sm text-slate-800">
            I confirm that I am <strong>{data.me.fullName}</strong> ({student?.admissionNumber}), I have read the examination instructions, and I am ready to begin my timed attempt.
          </span>
        </label>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => void onExit()}
            className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!readinessConfirmed || starting}
            onClick={() => {
              requestFullscreen();
              void handleStartOrResume();
            }}
            className="px-5 py-2.5 text-sm font-semibold bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white rounded-lg"
          >
            {starting ? 'Starting Attempt...' : 'Confirm Readiness & Start Examination'}
          </button>
        </div>
      </div>
    );
  }

  // PHASE 3: SUBMISSION CONFIRMATION
  if (phase === 'submitted') {
    return (
      <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-xl p-8 text-center space-y-6">
        <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-6 h-6 text-emerald-700" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-slate-900">
            {submissionOutcome?.status === 'time_expired'
              ? 'Examination Time Expired — Script Submitted'
              : 'Examination Script Submitted'}
          </h2>
          <p className="text-sm text-slate-600 mt-2">
            Your responses for <strong>{examination.title}</strong> have been securely recorded and locked on the Juneberries examination server.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4 border-y border-slate-200 py-4 text-sm">
          <div>
            <div className="text-xs text-slate-500">Total Questions</div>
            <div className="font-mono-tabular font-bold text-slate-900 mt-1">{questions.length}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Answered</div>
            <div className="font-mono-tabular font-bold text-emerald-700 mt-1">{answeredCount}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Status</div>
            <div className="font-semibold text-[#0A1E3D] mt-1">Locked</div>
          </div>
        </div>

        {submissionOutcome?.resultPublished && submissionOutcome.result ? (
          <div className="p-5 rounded-lg bg-slate-50 border border-slate-200 text-left space-y-2">
            <div className="text-xs font-semibold text-[#B8860B]">
              Published Objective Score Summary
            </div>
            <div className="flex items-baseline justify-between">
              <div className="font-mono-tabular text-2xl font-bold text-[#0A1E3D]">
                {submissionOutcome.result.totalScore} / {submissionOutcome.result.totalPossibleMarks}{' '}
                <span className="text-base font-medium text-slate-600">
                  ({submissionOutcome.result.percentage}%)
                </span>
              </div>
              <div className="text-sm font-bold text-slate-900">
                Grade {submissionOutcome.result.grade} · {submissionOutcome.result.remark}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Official results will appear in your Results tab once marking and administrative approval are completed.
          </p>
        )}

        <button
          type="button"
          onClick={() => void onExit()}
          className="px-6 py-2.5 bg-[#0A1E3D] text-white text-sm font-semibold rounded-lg hover:bg-[#132E59]"
        >
          Return to Student Dashboard
        </button>
      </div>
    );
  }

  // PHASE 2: ACTIVE CBT INTERFACE
  const currentResponse = currentQuestion ? answersMap[currentQuestion.id] ?? null : null;
  const currentFlagged = currentQuestion ? Boolean(flaggedMap[currentQuestion.id]) : false;

  return (
    <div className="space-y-4">
      {/* Examination Header Strip */}
      <div className="bg-[#0A1E3D] text-white rounded-xl px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <img
            src={data.settings.logoUrl || '/images/juneberry_crest.jpg'}
            alt="Juneberry Crest"
            referrerPolicy="no-referrer"
            className="w-10 h-10 rounded-md object-cover border border-white/20 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-xs text-[#E6C567] truncate">
              {data.settings.schoolName} · {studentClass?.name} · {subject?.name}
            </div>
            <h2 className="font-display text-base font-bold truncate">
              {examination.title}
            </h2>
            <div className="text-xs text-slate-300 mt-0.5">
              {data.me.fullName} · <span className="font-mono-tabular">{student?.admissionNumber}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 shrink-0">
          {/* Save & Network Status */}
          <div className="flex items-center gap-2 text-xs text-slate-200">
            {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-amber-400" />}
            <span>
              {syncState === 'saving'
                ? 'Saving...'
                : syncState === 'offline_queued'
                  ? 'Offline — Queued'
                  : 'All answers saved'}
            </span>
          </div>

          {/* Server-Controlled Countdown Timer */}
          <div
            data-testid="cbt-timer"
            className={`px-3.5 py-2 rounded-lg font-mono-tabular text-lg font-bold flex items-center gap-2 ${
              remainingSeconds <= 300
                ? 'bg-red-600 text-white'
                : 'bg-white/10 text-white border border-white/20'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>{formatTimer(remainingSeconds)}</span>
          </div>

          <button
            type="button"
            onClick={requestFullscreen}
            title="Enter Full-Screen Mode"
            aria-label="Enter Full-Screen Mode"
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
          >
            <Maximize2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowSubmitModal(true)}
            className="px-4 py-2 bg-[#B8860B] hover:bg-[#9E7208] text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Submit Exam</span>
          </button>
        </div>
      </div>

      {warningBanner && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-amber-50 border border-amber-300 text-sm text-amber-900 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{warningBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setWarningBanner(null)}
            className="text-xs font-semibold underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Main Two-Zone CBT Workspace */}
      {currentQuestion && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Question Stage */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div className="text-sm font-semibold text-[#0A1E3D]">
                Question{' '}
                <span className="font-mono-tabular">
                  {currentIndex + 1} of {questions.length}
                </span>
                <span className="text-slate-400 mx-2">·</span>
                <span className="text-xs font-normal text-slate-600">
                  {QUESTION_TYPE_LABELS[currentQuestion.questionType]} · {currentQuestion.topic} ·{' '}
                  <span className="font-mono-tabular">{currentQuestion.marks} mark{currentQuestion.marks === 1 ? '' : 's'}</span>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  const nextFlag = !currentFlagged;
                  setFlaggedMap((prev) => ({ ...prev, [currentQuestion.id]: nextFlag }));
                  queueAndSaveAnswer(currentQuestion.id, currentResponse, nextFlag, false);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 ${
                  currentFlagged
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Flag className="w-3.5 h-3.5" />
                <span>{currentFlagged ? 'Flagged for Review' : 'Flag for Review'}</span>
              </button>
            </div>

            <div className="text-base text-slate-900 leading-relaxed font-medium">
              {currentQuestion.questionText}
            </div>

            {currentQuestion.imageUrl && (
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-600">
                    Examination Reference Diagram
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomDiagram((z) => !z)}
                    className="text-xs font-medium text-[#163A70] flex items-center gap-1 hover:underline"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                    <span>{zoomDiagram ? 'Normal Size' : 'Enlarge Diagram'}</span>
                  </button>
                </div>
                <img
                  src={currentQuestion.imageUrl}
                  alt={`Diagram for question ${currentIndex + 1}`}
                  referrerPolicy="no-referrer"
                  className={`rounded border border-slate-200 bg-white mx-auto object-contain ${
                    zoomDiagram ? 'max-h-[520px] w-full' : 'max-h-72 w-auto'
                  }`}
                />
              </div>
            )}

            {/* Answer Controls by Question Type */}
            {(currentQuestion.questionType === 'mcq' ||
              currentQuestion.questionType === 'true_false' ||
              currentQuestion.questionType === 'image_based') && (
              <div className="space-y-2.5" role="radiogroup" aria-label="Answer options">
                {currentQuestion.options.map((opt) => {
                  const selected = currentResponse === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                        selected
                          ? 'bg-[#0A1E3D]/5 border-[#0A1E3D] text-slate-900'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`q_${currentQuestion.id}`}
                        checked={selected}
                        onChange={() => {
                          setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: opt.id }));
                          queueAndSaveAnswer(currentQuestion.id, opt.id, currentFlagged, false);
                        }}
                        className="mt-1"
                      />
                      <span className="font-mono-tabular text-xs font-bold text-[#0A1E3D] mt-0.5 w-5">
                        {opt.label}.
                      </span>
                      <span className="text-sm leading-relaxed">{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {currentQuestion.questionType === 'multiple_select' && (
              <div className="space-y-2.5">
                <p className="text-xs text-slate-500">Select all correct options that apply.</p>
                {currentQuestion.options.map((opt) => {
                  const currentList = Array.isArray(currentResponse) ? currentResponse : [];
                  const checked = currentList.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start gap-3 p-3.5 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#0A1E3D]/5 border-[#0A1E3D]'
                          : 'bg-white border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = checked
                            ? currentList.filter((x) => x !== opt.id)
                            : [...currentList, opt.id];
                          setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: next }));
                          queueAndSaveAnswer(currentQuestion.id, next, currentFlagged, false);
                        }}
                        className="mt-1 rounded"
                      />
                      <span className="font-mono-tabular text-xs font-bold text-[#0A1E3D] mt-0.5 w-5">
                        {opt.label}.
                      </span>
                      <span className="text-sm">{opt.text}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {(currentQuestion.questionType === 'fill_in_gap' ||
              currentQuestion.questionType === 'short_answer') && (
              <div>
                <label
                  htmlFor={`text_ans_${currentQuestion.id}`}
                  className="block text-xs font-medium text-slate-600 mb-1.5"
                >
                  Enter your answer precisely
                </label>
                <input
                  id={`text_ans_${currentQuestion.id}`}
                  type="text"
                  value={typeof currentResponse === 'string' ? currentResponse : ''}
                  placeholder="Type your answer here..."
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: val }));
                    queueAndSaveAnswer(currentQuestion.id, val, currentFlagged, true);
                  }}
                  className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                />
              </div>
            )}

            {currentQuestion.questionType === 'essay' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor={`essay_ans_${currentQuestion.id}`}
                    className="text-xs font-medium text-slate-600"
                  >
                    Essay / Theory Response (saved automatically while typing)
                  </label>
                  <span className="font-mono-tabular text-xs text-slate-500">
                    {typeof currentResponse === 'string' && currentResponse.trim()
                      ? currentResponse.trim().split(/\s+/).length
                      : 0}{' '}
                    words
                  </span>
                </div>
                <textarea
                  id={`essay_ans_${currentQuestion.id}`}
                  rows={7}
                  value={typeof currentResponse === 'string' ? currentResponse : ''}
                  placeholder="Write a structured, well-explained response..."
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: val }));
                    queueAndSaveAnswer(currentQuestion.id, val, currentFlagged, true);
                  }}
                  className="w-full px-4 py-3 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                />
              </div>
            )}

            {currentQuestion.questionType === 'matching' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500">
                  Match each item on the left to its corresponding definition on the right.
                </p>
                {(currentQuestion.matchingLeftItems || []).map((leftItem) => {
                  const mapVal =
                    currentResponse &&
                    typeof currentResponse === 'object' &&
                    !Array.isArray(currentResponse)
                      ? (currentResponse as Record<string, string>)
                      : {};
                  return (
                    <div
                      key={leftItem}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center p-3 rounded-lg border border-slate-200 bg-slate-50"
                    >
                      <span className="text-sm font-medium text-slate-900">{leftItem}</span>
                      <select
                        aria-label={`Match for ${leftItem}`}
                        value={mapVal[leftItem] || ''}
                        onChange={(e) => {
                          const nextMap = { ...mapVal, [leftItem]: e.target.value };
                          setAnswersMap((prev) => ({ ...prev, [currentQuestion.id]: nextMap }));
                          queueAndSaveAnswer(currentQuestion.id, nextMap, currentFlagged, false);
                        }}
                        className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="">-- Select matching pair --</option>
                        {(currentQuestion.matchingRightItems || []).map((rightItem) => (
                          <option key={rightItem} value={rightItem}>
                            {rightItem}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Navigation Footer */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                type="button"
                disabled={currentIndex === 0 || examination.restrictNavigation}
                onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Previous</span>
              </button>

              {currentIndex < questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
                  className="px-5 py-2 text-sm font-semibold bg-[#0A1E3D] hover:bg-[#132E59] text-white rounded-lg flex items-center gap-1.5"
                >
                  <span>Next Question</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(true)}
                  className="px-5 py-2 text-sm font-semibold bg-[#B8860B] hover:bg-[#9E7208] text-white rounded-lg flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Review & Submit</span>
                </button>
              )}
            </div>
          </div>

          {/* Question Navigator Panel */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Question Navigation Grid
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-mono-tabular">
                {answeredCount} answered · {unansweredCount} remaining · {flaggedCount} flagged
              </p>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isCurr = idx === currentIndex;
                const ans = isAnswered(answersMap[q.id]);
                const flag = Boolean(flaggedMap[q.id]);

                let style = 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100';
                if (ans) style = 'bg-emerald-50 border-emerald-500 text-emerald-900 font-semibold';
                if (flag) style = 'bg-amber-50 border-amber-500 text-amber-900 font-semibold';
                if (isCurr) style = 'bg-[#0A1E3D] border-[#0A1E3D] text-white font-bold';

                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={examination.restrictNavigation && idx < currentIndex}
                    onClick={() => setCurrentIndex(idx)}
                    aria-label={`Question ${idx + 1}${isCurr ? ', current' : ''}${
                      ans ? ', answered' : ', unanswered'
                    }${flag ? ', flagged for review' : ''}`}
                    className={`h-10 rounded-lg border font-mono-tabular text-xs flex items-center justify-center relative transition-colors ${style}`}
                  >
                    {idx + 1}
                    {flag && !isCurr && (
                      <Flag className="w-2.5 h-2.5 absolute top-1 right-1 text-amber-700" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2 pt-3 border-t border-slate-200 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-[#0A1E3D] inline-block" />
                <span>Current Question</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-emerald-50 border border-emerald-500 inline-block" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-amber-50 border border-amber-500 inline-block" />
                <span>Marked for Review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded bg-slate-50 border border-slate-300 inline-block" />
                <span>Unanswered</span>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Pre-Submission Confirmation Modal */}
      {showSubmitModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="submit-modal-title"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full p-6 space-y-5">
            <h3 id="submit-modal-title" className="font-display text-lg font-bold text-slate-900">
              Confirm Examination Submission
            </h3>
            <p className="text-sm text-slate-600">
              Once submitted, your examination script is permanently locked and cannot be edited.
            </p>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Total Questions</div>
                <div className="font-mono-tabular font-bold text-slate-900">{questions.length}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Answered</div>
                <div className="font-mono-tabular font-bold text-emerald-700">{answeredCount}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Unanswered</div>
                <div className="font-mono-tabular font-bold text-red-700">{unansweredCount}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Flagged for Review</div>
                <div className="font-mono-tabular font-bold text-amber-700">{flaggedCount}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowSubmitModal(false)}
                className="px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50"
              >
                Return to Exam
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleFinalSubmit('submitted')}
                className="px-5 py-2 text-sm font-semibold bg-[#0A1E3D] hover:bg-[#132E59] text-white rounded-lg"
              >
                {submitting ? 'Submitting...' : 'Confirm Final Submission'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
