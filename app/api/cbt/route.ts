import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import {
  calculateResultTotals,
  computeRemainingSeconds,
  evaluateAnswer,
  isAttemptExpired,
  sanitizeQuestionForStudent,
  shuffleDeterministically,
} from '@/lib/cbt-engine';
import type {
  Examination,
  ExaminationAttempt,
  SchoolDatabase,
  StudentAnswer,
} from '@/lib/types';

function finalizeAttemptInDb(
  db: SchoolDatabase,
  attempt: ExaminationAttempt,
  exam: Examination,
  finalStatus: 'submitted' | 'time_expired'
) {
  const nowIso = new Date().toISOString();
  attempt.status = finalStatus;
  attempt.submittedAt = nowIso;
  attempt.lastActivityAt = nowIso;

  const examLinks = db.examinationQuestions.filter(
    (eq) => eq.examinationId === exam.id
  );
  const policy = {
    allowPartialMultipleSelect: db.settings.allowPartialMultipleSelect,
    enableNegativeMarking: exam.enableNegativeMarking,
    negativeMarkPenalty: exam.negativeMarkPenalty,
  };

  let totalPossibleMarks = 0;
  let hasManualQuestions = false;
  const attemptAnswers: StudentAnswer[] = [];

  for (const qId of attempt.questionOrder) {
    const q = db.questions.find((item) => item.id === qId);
    if (!q) continue;
    const link = examLinks.find((l) => l.questionId === qId);
    const maxMarks = link?.marksOverride ?? q.marks;
    totalPossibleMarks += maxMarks;

    let ans = db.answers.find(
      (a) => a.attemptId === attempt.id && a.questionId === qId
    );
    if (!ans) {
      ans = {
        id: newId('ans'),
        attemptId: attempt.id,
        questionId: qId,
        response: null,
        flaggedForReview: false,
        isObjectiveMarked: false,
        requiresManualMarking: false,
        marksAwarded: 0,
        updatedAt: nowIso,
      };
      db.answers.push(ans);
    }

    const evaluation = evaluateAnswer(q, ans.response, maxMarks, policy);
    ans.isObjectiveMarked = evaluation.isObjectiveMarked;
    ans.requiresManualMarking = evaluation.requiresManualMarking;
    ans.marksAwarded = evaluation.marksAwarded;
    ans.updatedAt = nowIso;
    if (evaluation.requiresManualMarking) {
      hasManualQuestions = true;
    }
    attemptAnswers.push(ans);
  }

  const totals = calculateResultTotals(
    attemptAnswers,
    totalPossibleMarks,
    exam.passMarkPercent,
    db.settings.gradingScale
  );

  if (!hasManualQuestions) {
    attempt.status = 'graded';
  }

  const autoPublish = exam.autoPublishObjectiveResults && !hasManualQuestions;
  const student = db.students.find((s) => s.id === attempt.studentId);

  const existingResult = db.results.find((r) => r.attemptId === attempt.id);
  if (!existingResult) {
    db.results.unshift({
      id: newId('res'),
      attemptId: attempt.id,
      examinationId: exam.id,
      studentId: attempt.studentId,
      sessionId: exam.sessionId,
      termId: exam.termId,
      classId: exam.classId,
      subjectId: exam.subjectId,
      objectiveScore: totals.objectiveScore,
      subjectiveScore: totals.subjectiveScore,
      totalScore: totals.totalScore,
      totalPossibleMarks: totals.totalPossibleMarks,
      percentage: totals.percentage,
      grade: totals.grade,
      remark: totals.remark,
      passed: totals.passed,
      status: autoPublish ? 'published' : 'pending_review',
      manualGradingCompleted: !hasManualQuestions,
      publishedAt: autoPublish ? nowIso : undefined,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  if (hasManualQuestions) {
    for (const teacherProfId of exam.assignedTeacherProfileIds) {
      db.notifications.unshift({
        id: newId('notif'),
        recipientProfileId: teacherProfId,
        title: 'Essay Script Ready for Grading',
        message: `A student submitted ${exam.title} and requires manual essay marking.`,
        category: 'result',
        isRead: false,
        linkView: 'essay-marking',
        createdAt: nowIso,
      });
    }
  } else if (autoPublish && student) {
    db.notifications.unshift({
      id: newId('notif'),
      recipientProfileId: student.profileId,
      title: `Result Published: ${exam.title}`,
      message: `Score: ${totals.totalScore}/${totals.totalPossibleMarks} (${totals.percentage}%) · Grade ${totals.grade}.`,
      category: 'result',
      isRead: false,
      linkView: 'student-results',
      createdAt: nowIso,
    });
  }

  return totals;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();
  const me = auth.profile;

  try {
    const body = (await req.json()) as {
      action: 'start_exam' | 'save_answer' | 'record_incident' | 'submit_exam' | 'heartbeat';
      payload?: Record<string, unknown>;
    };

    const p = body.payload || {};

    if (body.action === 'record_incident') {
      const examinationId = String(p.examinationId || '');
      const attemptId = p.attemptId ? String(p.attemptId) : undefined;
      const eventType = String(p.eventType || 'tab_switch') as
        | 'tab_switch'
        | 'focus_loss'
        | 'page_refresh'
        | 'network_drop'
        | 'invigilator_report';
      const description = String(p.description || '').trim();

      if (
        me.role === 'student' &&
        eventType === 'invigilator_report'
      ) {
        return forbiddenResponse();
      }

      const res = await mutateDb((db) => {
        const now = new Date().toISOString();
        let targetStudentId = p.studentId ? String(p.studentId) : undefined;
        let autoSubmitted = false;

        if (attemptId) {
          const att = db.attempts.find((a) => a.id === attemptId);
          if (att) {
            if (me.role === 'student') {
              const stu = db.students.find((s) => s.profileId === me.id);
              if (!stu || stu.id !== att.studentId) {
                return { error: 'Forbidden attempt access.', status: 403 as const };
              }
            }
            targetStudentId = att.studentId;
            if (eventType === 'tab_switch') att.tabVisibilityChanges++;
            if (eventType === 'focus_loss') att.focusLosses++;
            if (eventType === 'page_refresh') att.pageRefreshes++;
            if (eventType === 'network_drop') att.connectionInterruptions++;
            att.lastActivityAt = now;
          }
        }

        db.incidents.unshift({
          id: newId('inc'),
          examinationId,
          attemptId,
          studentId: targetStudentId,
          reportedByProfileId: me.id,
          eventType,
          severity: eventType === 'invigilator_report' ? 'critical' : 'warning',
          description: description || `Recorded ${eventType.replace('_', ' ')} event.`,
          createdAt: now,
        });

        return { status: 200 as const, autoSubmitted };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, autoSubmitted: res.autoSubmitted });
    }

    // Student-only actions below
    if (me.role !== 'student') {
      return forbiddenResponse('Only authenticated students can take CBT examinations.');
    }

    if (body.action === 'start_exam') {
      const examinationId = String(p.examinationId || '');
      if (!examinationId) {
        return NextResponse.json({ error: 'Examination ID is required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const student = db.students.find((s) => s.profileId === me.id);
        if (!student || student.accountStatus !== 'active') {
          return { error: 'Your student account is not active.', status: 403 as const };
        }

        const exam = db.examinations.find((e) => e.id === examinationId);
        if (!exam) {
          return { error: 'Examination not found.', status: 404 as const };
        }

        const isEligible =
          exam.classId === student.classId ||
          exam.assignedStudentIds.includes(student.id);
        if (!isEligible) {
          return { error: 'You are not enrolled or eligible for this examination.', status: 403 as const };
        }

        if (exam.status !== 'active' && exam.status !== 'rescheduled') {
          return {
            error: `This examination is currently ${exam.status} and cannot be started.`,
            status: 403 as const,
          };
        }

        const existingAttempts = db.attempts.filter(
          (a) => a.examinationId === exam.id && a.studentId === student.id
        );

        // Restore active attempt if unexpired
        const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');
        if (activeAttempt) {
          if (isAttemptExpired(activeAttempt.deadlineAt)) {
            finalizeAttemptInDb(db, activeAttempt, exam, 'time_expired');
            return {
              error: 'Your examination time has expired and your script has been automatically submitted.',
              status: 409 as const,
              expiredAttemptId: activeAttempt.id,
            };
          }

          activeAttempt.pageRefreshes++;
          activeAttempt.lastActivityAt = new Date().toISOString();

          const links = db.examinationQuestions.filter((eq) => eq.examinationId === exam.id);
          const sanitizedQuestions = activeAttempt.questionOrder
            .map((qId) => {
              const q = db.questions.find((item) => item.id === qId);
              if (!q) return null;
              const link = links.find((l) => l.questionId === qId);
              return sanitizeQuestionForStudent(
                q,
                activeAttempt.optionOrders[qId],
                link?.marksOverride
              );
            })
            .filter(Boolean);

          const savedAnswers = db.answers.filter(
            (ans) => ans.attemptId === activeAttempt.id
          );

          return {
            status: 200 as const,
            resumed: true,
            attempt: activeAttempt,
            remainingSeconds: computeRemainingSeconds(activeAttempt.deadlineAt),
            questions: sanitizedQuestions,
            answers: savedAnswers,
          };
        }

        if (existingAttempts.length >= exam.maxAttempts) {
          return {
            error: `Maximum allowed attempts (${exam.maxAttempts}) exhausted for this examination.`,
            status: 403 as const,
          };
        }

        const links = db.examinationQuestions
          .filter((eq) => eq.examinationId === exam.id)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        const orderedQuestions = shuffleDeterministically(
          links.map((l) => l.questionId),
          exam.randomiseQuestions
        );

        const optionOrders: Record<string, string[]> = {};
        for (const qId of orderedQuestions) {
          const q = db.questions.find((item) => item.id === qId);
          if (q && q.options.length > 0) {
            optionOrders[qId] = shuffleDeterministically(
              q.options.map((o) => o.id),
              exam.randomiseOptions
            );
          }
        }

        const nowMs = Date.now();
        const startedAt = new Date(nowMs).toISOString();
        const deadlineAt = new Date(
          nowMs + exam.durationMinutes * 60 * 1000
        ).toISOString();

        const newAttempt: ExaminationAttempt = {
          id: newId('att'),
          examinationId: exam.id,
          studentId: student.id,
          attemptNumber: existingAttempts.length + 1,
          status: 'in_progress',
          questionOrder: orderedQuestions,
          optionOrders,
          startedAt,
          deadlineAt,
          lastActivityAt: startedAt,
          connectionInterruptions: 0,
          tabVisibilityChanges: 0,
          focusLosses: 0,
          pageRefreshes: 0,
          createdAt: startedAt,
        };
        db.attempts.unshift(newAttempt);

        appendAuditLog(
          db,
          me,
          'EXAM_ATTEMPT_STARTED',
          'examination_attempt',
          newAttempt.id,
          `Started attempt #${newAttempt.attemptNumber} for "${exam.title}".`
        );

        const sanitizedQuestions = orderedQuestions
          .map((qId) => {
            const q = db.questions.find((item) => item.id === qId);
            if (!q) return null;
            const link = links.find((l) => l.questionId === qId);
            return sanitizeQuestionForStudent(
              q,
              optionOrders[qId],
              link?.marksOverride
            );
          })
          .filter(Boolean);

        return {
          status: 201 as const,
          resumed: false,
          attempt: newAttempt,
          remainingSeconds: computeRemainingSeconds(deadlineAt, nowMs),
          questions: sanitizedQuestions,
          answers: [] as StudentAnswer[],
        };
      });

      if ('error' in res) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json(res, { status: res.status });
    }

    if (body.action === 'save_answer' || body.action === 'heartbeat') {
      const attemptId = String(p.attemptId || '');
      const questionId = String(p.questionId || '');
      const response = p.response as string | string[] | Record<string, string> | null;
      const flaggedForReview = Boolean(p.flaggedForReview);

      if (!attemptId) {
        return NextResponse.json({ error: 'Attempt ID is required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const student = db.students.find((s) => s.profileId === me.id);
        const attempt = db.attempts.find((a) => a.id === attemptId);
        if (!student || !attempt || attempt.studentId !== student.id) {
          return { error: 'Unauthorized attempt access.', status: 403 as const };
        }
        const exam = db.examinations.find((e) => e.id === attempt.examinationId);
        if (!exam) {
          return { error: 'Examination record missing.', status: 404 as const };
        }

        if (attempt.status !== 'in_progress') {
          return {
            error: 'This examination attempt is already locked.',
            status: 409 as const,
            submitted: true,
          };
        }

        if (isAttemptExpired(attempt.deadlineAt)) {
          finalizeAttemptInDb(db, attempt, exam, 'time_expired');
          return {
            error: 'Official examination deadline reached. Script auto-submitted.',
            status: 409 as const,
            expired: true,
          };
        }

        const nowIso = new Date().toISOString();
        attempt.lastActivityAt = nowIso;

        if (body.action === 'save_answer' && questionId) {
          if (!attempt.questionOrder.includes(questionId)) {
            return { error: 'Question does not belong to this attempt.', status: 400 as const };
          }
          let existing = db.answers.find(
            (a) => a.attemptId === attempt.id && a.questionId === questionId
          );
          if (!existing) {
            existing = {
              id: newId('ans'),
              attemptId: attempt.id,
              questionId,
              response: response ?? null,
              flaggedForReview,
              isObjectiveMarked: false,
              requiresManualMarking: false,
              marksAwarded: 0,
              updatedAt: nowIso,
            };
            db.answers.push(existing);
          } else {
            if (p.response !== undefined) existing.response = response ?? null;
            if (p.flaggedForReview !== undefined) existing.flaggedForReview = flaggedForReview;
            existing.updatedAt = nowIso;
          }
        }

        return {
          status: 200 as const,
          savedAt: nowIso,
          remainingSeconds: computeRemainingSeconds(attempt.deadlineAt),
        };
      });

      if ('error' in res) {
        return NextResponse.json(res, { status: res.status });
      }
      return NextResponse.json(res);
    }

    if (body.action === 'submit_exam') {
      const attemptId = String(p.attemptId || '');
      const reason = p.reason === 'time_expired' ? 'time_expired' : 'submitted';

      const res = await mutateDb((db) => {
        const student = db.students.find((s) => s.profileId === me.id);
        const attempt = db.attempts.find((a) => a.id === attemptId);
        if (!student || !attempt || attempt.studentId !== student.id) {
          return { error: 'Unauthorized attempt submission.', status: 403 as const };
        }
        const exam = db.examinations.find((e) => e.id === attempt.examinationId);
        if (!exam) return { error: 'Examination not found.', status: 404 as const };

        if (attempt.status !== 'in_progress') {
          const existingResult = db.results.find((r) => r.attemptId === attempt.id);
          return {
            status: 200 as const,
            alreadySubmitted: true,
            attempt,
            resultPublished: existingResult?.status === 'published',
            result: existingResult?.status === 'published' ? existingResult : null,
          };
        }

        const effectiveStatus = isAttemptExpired(attempt.deadlineAt)
          ? 'time_expired'
          : reason;
        finalizeAttemptInDb(db, attempt, exam, effectiveStatus);

        appendAuditLog(
          db,
          me,
          'EXAM_SUBMITTED',
          'examination_attempt',
          attempt.id,
          `Submitted "${exam.title}" (${effectiveStatus}).`
        );

        const result = db.results.find((r) => r.attemptId === attempt.id);
        return {
          status: 200 as const,
          alreadySubmitted: false,
          attempt,
          resultPublished: result?.status === 'published',
          result: result?.status === 'published' ? result : null,
        };
      });

      if ('error' in res) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: 'Unsupported CBT action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid CBT request.' }, { status: 400 });
  }
}
