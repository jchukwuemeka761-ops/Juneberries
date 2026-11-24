import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { calculateResultTotals, resolveGrade, roundScore } from '@/lib/cbt-engine';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();
  const me = auth.profile;

  if (!['super_admin', 'exam_officer', 'teacher', 'hod'].includes(me.role)) {
    return forbiddenResponse('Insufficient permissions for grading or result operations.');
  }

  try {
    const body = (await req.json()) as {
      action: 'grade_essay' | 'update_result_status' | 'correct_result_score';
      payload?: Record<string, unknown>;
    };
    const p = body.payload || {};

    if (body.action === 'grade_essay') {
      const answerId = String(p.answerId || '');
      const marksAwarded = Number(p.marksAwarded ?? 0);
      const teacherFeedback = String(p.teacherFeedback || '').trim();
      const finalize = Boolean(p.finalize);

      if (!answerId || Number.isNaN(marksAwarded) || marksAwarded < 0) {
        return NextResponse.json({ error: 'Valid answer ID and non-negative marks are required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const ans = db.answers.find((a) => a.id === answerId);
        if (!ans) return { error: 'Student answer not found.', status: 404 as const };

        const attempt = db.attempts.find((at) => at.id === ans.attemptId);
        const exam = attempt
          ? db.examinations.find((e) => e.id === attempt.examinationId)
          : undefined;
        const question = db.questions.find((q) => q.id === ans.questionId);
        const link = exam
          ? db.examinationQuestions.find(
              (eq) => eq.examinationId === exam.id && eq.questionId === ans.questionId
            )
          : undefined;
        const maxMarks = link?.marksOverride ?? question?.marks ?? 10;

        if (marksAwarded > maxMarks) {
          return {
            error: `Awarded marks (${marksAwarded}) cannot exceed question maximum (${maxMarks}).`,
            status: 400 as const,
          };
        }

        if (me.role === 'teacher' && exam && !exam.assignedTeacherProfileIds.includes(me.id)) {
          const staff = db.staff.find((s) => s.profileId === me.id);
          const hasSub = staff
            ? db.teacherAssignments.some(
                (ta) => ta.staffId === staff.id && ta.subjectId === exam.subjectId
              )
            : false;
          if (!hasSub) {
            return { error: 'You may only mark scripts for your assigned subjects.', status: 403 as const };
          }
        }

        const now = new Date().toISOString();
        ans.marksAwarded = roundScore(marksAwarded);
        ans.teacherFeedback = teacherFeedback;
        if (finalize) {
          ans.markedByProfileId = me.id;
        }
        ans.updatedAt = now;

        if (attempt && exam) {
          const allAttemptAnswers = db.answers.filter((a) => a.attemptId === attempt.id);
          const totals = calculateResultTotals(
            allAttemptAnswers,
            exam.totalMarks,
            exam.passMarkPercent,
            db.settings.gradingScale
          );
          if (totals.manualGradingCompleted) {
            attempt.status = 'graded';
          }
          const result = db.results.find((r) => r.attemptId === attempt.id);
          if (result) {
            result.objectiveScore = totals.objectiveScore;
            result.subjectiveScore = totals.subjectiveScore;
            result.totalScore = totals.totalScore;
            result.percentage = totals.percentage;
            result.grade = totals.grade;
            result.remark = totals.remark;
            result.passed = totals.passed;
            result.manualGradingCompleted = totals.manualGradingCompleted;
            result.updatedAt = now;
          }
        }

        appendAuditLog(
          db,
          me,
          finalize ? 'ESSAY_FINAL_GRADED' : 'ESSAY_DRAFT_SAVED',
          'student_answer',
          ans.id,
          `Awarded ${marksAwarded}/${maxMarks} marks.`
        );

        return { status: 200 as const };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'update_result_status') {
      if (!['super_admin', 'exam_officer'].includes(me.role)) {
        return forbiddenResponse('Only Examination Officers or Super Admins can approve or publish results.');
      }

      const resultIds = (p.resultIds as string[]) || (p.resultId ? [String(p.resultId)] : []);
      const nextStatus = String(p.status || '') as 'approved' | 'published' | 'withheld' | 'pending_review';
      const reason = String(p.reason || '').trim();

      if (resultIds.length === 0 || !['approved', 'published', 'withheld', 'pending_review'].includes(nextStatus)) {
        return NextResponse.json({ error: 'Result IDs and valid target status are required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const now = new Date().toISOString();
        let updatedCount = 0;
        for (const rId of resultIds) {
          const r = db.results.find((item) => item.id === rId);
          if (!r) continue;
          if (nextStatus === 'published' && !r.manualGradingCompleted) {
            return {
              error: 'Cannot publish a result while essay/subjective questions remain ungraded.',
              status: 400 as const,
            };
          }
          r.status = nextStatus;
          if (nextStatus === 'published') r.publishedAt = now;
          r.updatedAt = now;
          db.resultApprovals.unshift({
            id: newId('ra'),
            resultId: r.id,
            reviewerProfileId: me.id,
            action: nextStatus,
            reason,
            createdAt: now,
          });

          if (nextStatus === 'published') {
            const stu = db.students.find((s) => s.id === r.studentId);
            const exam = db.examinations.find((e) => e.id === r.examinationId);
            if (stu) {
              db.notifications.unshift({
                id: newId('notif'),
                recipientProfileId: stu.profileId,
                title: `Official Result Released: ${exam?.title || 'Examination'}`,
                message: `Your score (${r.totalScore}/${r.totalPossibleMarks} · ${r.percentage}% · Grade ${r.grade}) is now available.`,
                category: 'result',
                isRead: false,
                linkView: 'student-results',
                createdAt: now,
              });
            }
          }
          updatedCount++;
        }

        appendAuditLog(
          db,
          me,
          'RESULTS_STATUS_UPDATED',
          'examination_result',
          resultIds.join(','),
          `Set ${updatedCount} result(s) to ${nextStatus}${reason ? ` — ${reason}` : ''}.`
        );

        return { status: 200 as const, updatedCount };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, updatedCount: res.updatedCount });
    }

    if (body.action === 'correct_result_score') {
      if (me.role !== 'super_admin') {
        return forbiddenResponse('Only Super Administrator may adjust a finalized result score.');
      }
      const resultId = String(p.resultId || '');
      const newTotalScore = Number(p.totalScore);
      const correctionReason = String(p.correctionReason || '').trim();

      if (!resultId || Number.isNaN(newTotalScore) || newTotalScore < 0 || !correctionReason) {
        return NextResponse.json(
          { error: 'Result ID, valid score, and an audit reason are required.' },
          { status: 400 }
        );
      }

      const res = await mutateDb((db) => {
        const r = db.results.find((item) => item.id === resultId);
        if (!r) return { error: 'Result record not found.', status: 404 as const };
        if (newTotalScore > r.totalPossibleMarks) {
          return {
            error: `Adjusted score cannot exceed ${r.totalPossibleMarks}.`,
            status: 400 as const,
          };
        }
        const exam = db.examinations.find((e) => e.id === r.examinationId);
        const passMark = exam?.passMarkPercent ?? 50;
        const pct = roundScore((newTotalScore / Math.max(1, r.totalPossibleMarks)) * 100);
        const { grade, remark } = resolveGrade(pct, db.settings.gradingScale);
        const oldScore = r.totalScore;
        r.totalScore = roundScore(newTotalScore);
        r.percentage = pct;
        r.grade = grade;
        r.remark = remark;
        r.passed = pct >= passMark;
        r.correctionReason = correctionReason;
        r.updatedAt = new Date().toISOString();

        appendAuditLog(
          db,
          me,
          'RESULT_SCORE_CORRECTED',
          'examination_result',
          r.id,
          `Adjusted score from ${oldScore} to ${r.totalScore}/${r.totalPossibleMarks}. Reason: ${correctionReason}`
        );

        return { status: 200 as const };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid results action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid results request.' }, { status: 400 });
  }
}
