import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import type { ExaminationStatus, ExaminationType } from '@/lib/types';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();
  const me = auth.profile;

  if (!['super_admin', 'exam_officer', 'teacher'].includes(me.role)) {
    return forbiddenResponse('Only administrators, examination officers, or teachers may manage examinations.');
  }

  try {
    const body = (await req.json()) as {
      action: 'create' | 'update_status' | 'reschedule';
      payload?: Record<string, unknown>;
    };

    const p = body.payload || {};

    if (body.action === 'create') {
      const title = String(p.title || '').trim();
      const sessionId = String(p.sessionId || '');
      const termId = String(p.termId || '');
      const classId = String(p.classId || '');
      const subjectId = String(p.subjectId || '');
      const examType = String(p.examType || 'continuous_assessment') as ExaminationType;
      const examDate = String(p.examDate || '');
      const startTime = String(p.startTime || '09:00');
      const endTime = String(p.endTime || '17:00');
      const durationMinutes = Number(p.durationMinutes || 30);
      const passMarkPercent = Number(p.passMarkPercent || 50);
      const maxAttempts = Number(p.maxAttempts || 1);
      const selectedQuestionIds = (p.questionIds as string[]) || [];
      const autoSelectTopic = p.autoSelectTopic ? String(p.autoSelectTopic) : '';
      const autoSelectCount = Number(p.autoSelectCount || 0);
      const status = String(p.status || 'active') as ExaminationStatus;

      if (!title || !classId || !subjectId || !examDate || durationMinutes <= 0) {
        return NextResponse.json(
          { error: 'Title, class, subject, date, and positive duration are required.' },
          { status: 400 }
        );
      }

      if (me.role === 'teacher' && !['class_quiz', 'practice', 'weekly_test'].includes(examType)) {
        return forbiddenResponse(
          'Teachers may only create quizzes, weekly tests, or practice examinations.'
        );
      }

      const res = await mutateDb((db) => {
        if (me.role === 'teacher') {
          const staff = db.staff.find((s) => s.profileId === me.id);
          const hasAssignment = staff
            ? db.teacherAssignments.some(
                (ta) =>
                  ta.staffId === staff.id &&
                  ta.classId === classId &&
                  ta.subjectId === subjectId
              )
            : false;
          if (!hasAssignment) {
            return {
              error:
                'You may only create quizzes or tests for classes and subjects assigned to your profile.',
              status: 403 as const,
            };
          }
        }

        const allowUnapproved =
          me.role === 'super_admin' && db.settings.allowUnapprovedQuestionsByAdmin;
        const isTeacherQuizOrPractice =
          me.role === 'teacher' && (examType === 'class_quiz' || examType === 'practice');

        const eligiblePool = db.questions.filter(
          (q) =>
            q.subjectId === subjectId &&
            q.classId === classId &&
            (allowUnapproved ||
              q.approvalStatus === 'approved' ||
              (isTeacherQuizOrPractice &&
                q.teacherProfileId === me.id &&
                q.approvalStatus !== 'rejected' &&
                q.approvalStatus !== 'archived'))
        );

        let chosenQuestions = eligiblePool.filter((q) =>
          selectedQuestionIds.includes(q.id)
        );

        if (chosenQuestions.length === 0 && autoSelectCount > 0) {
          const topicFiltered = autoSelectTopic
            ? eligiblePool.filter((q) =>
                q.topic.toLowerCase().includes(autoSelectTopic.toLowerCase())
              )
            : eligiblePool;
          chosenQuestions = topicFiltered.slice(0, autoSelectCount);
        }

        if (chosenQuestions.length === 0) {
          return {
            error: isTeacherQuizOrPractice
              ? 'Select at least one submitted or approved question for this class and subject.'
              : 'Select at least one approved question from the Question Bank for this class and subject.',
            status: 400 as const,
          };
        }

        const now = new Date().toISOString();
        const examId = newId('exam');
        const resolvedSessionId =
          sessionId || db.sessions.find((s) => s.isCurrent)?.id || 'sess_2026_2027';
        const resolvedTermId =
          termId || db.terms.find((t) => t.isCurrent)?.id || 'term_1';
        const totalMarks = chosenQuestions.reduce((sum, q) => sum + q.marks, 0);

        const classStudents = db.students.filter(
          (s) => s.classId === classId && s.accountStatus === 'active'
        );
        const assignedStudentIds =
          Array.isArray(p.assignedStudentIds) && p.assignedStudentIds.length > 0
            ? (p.assignedStudentIds as string[])
            : classStudents.map((s) => s.id);

        db.examinations.unshift({
          id: examId,
          title,
          sessionId: resolvedSessionId,
          termId: resolvedTermId,
          classId,
          subjectId,
          examType,
          examDate,
          startTime,
          endTime,
          durationMinutes,
          totalMarks,
          questionCount: chosenQuestions.length,
          passMarkPercent,
          maxAttempts,
          instructions:
            String(p.instructions || '').trim() || db.settings.defaultInstructions,
          assignedStudentIds,
          assignedTeacherProfileIds: (p.assignedTeacherProfileIds as string[]) || [me.id],
          assignedInvigilatorProfileIds:
            (p.assignedInvigilatorProfileIds as string[]) || [],
          randomiseQuestions: Boolean(p.randomiseQuestions),
          randomiseOptions: Boolean(p.randomiseOptions),
          restrictNavigation: Boolean(p.restrictNavigation),
          enableNegativeMarking: Boolean(p.enableNegativeMarking),
          negativeMarkPenalty: Number(p.negativeMarkPenalty || 0),
          autoPublishObjectiveResults: Boolean(p.autoPublishObjectiveResults),
          status,
          createdByProfileId: me.id,
          createdAt: now,
          updatedAt: now,
        });

        chosenQuestions.forEach((q, idx) => {
          db.examinationQuestions.push({
            id: newId('eq'),
            examinationId: examId,
            questionId: q.id,
            orderIndex: idx,
          });
        });

        for (const stuId of assignedStudentIds) {
          db.examinationAssignments.push({
            id: newId('ea'),
            examinationId: examId,
            studentId: stuId,
            eligible: true,
            createdAt: now,
          });
          const stu = db.students.find((s) => s.id === stuId);
          if (stu && (status === 'active' || status === 'scheduled')) {
            db.notifications.unshift({
              id: newId('notif'),
              recipientProfileId: stu.profileId,
              title: `Examination Scheduled: ${title}`,
              message: `Date: ${examDate} (${startTime}–${endTime}) · Duration: ${durationMinutes} mins.`,
              category: 'exam',
              isRead: false,
              linkView: 'student-exams',
              createdAt: now,
            });
          }
        }

        appendAuditLog(
          db,
          me,
          'EXAMINATION_CREATED',
          'examination',
          examId,
          `Created "${title}" with ${chosenQuestions.length} questions (${totalMarks} marks).`
        );

        return { status: 201 as const, examId };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, examId: res.examId }, { status: 201 });
    }

    if (body.action === 'update_status' || body.action === 'reschedule') {
      if (!['super_admin', 'exam_officer'].includes(me.role)) {
        return forbiddenResponse('Only Examination Officers or Super Admins can reschedule or change exam status.');
      }
      const examId = String(p.examId || '');
      const res = await mutateDb((db) => {
        const ex = db.examinations.find((e) => e.id === examId);
        if (!ex) return { error: 'Examination not found.', status: 404 as const };
        if (body.action === 'update_status') {
          ex.status = String(p.status) as ExaminationStatus;
        } else {
          if (p.examDate) ex.examDate = String(p.examDate);
          if (p.startTime) ex.startTime = String(p.startTime);
          if (p.endTime) ex.endTime = String(p.endTime);
          if (p.durationMinutes) ex.durationMinutes = Number(p.durationMinutes);
          ex.status = 'rescheduled';
        }
        ex.updatedAt = new Date().toISOString();
        appendAuditLog(db, me, 'EXAMINATION_UPDATED', 'examination', ex.id, `Updated exam status=${ex.status}.`);
        return { status: 200 as const };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid exam action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid examination payload.' }, { status: 400 });
  }
}
