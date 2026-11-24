import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { parseCsvLines, validateAndParseQuestionRows } from '@/lib/bulk-import';
import { isValidSafeUrl } from '@/lib/server/security';
import type { DifficultyLevel, MatchingPair, QuestionApprovalStatus, QuestionOption, QuestionType } from '@/lib/types';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();
  const me = auth.profile;

  if (!['super_admin', 'exam_officer', 'hod', 'teacher'].includes(me.role)) {
    return forbiddenResponse('Only academic staff may manage the question bank.');
  }

  try {
    const body = (await req.json()) as {
      action: 'create' | 'bulk_import' | 'review' | 'update' | 'delete';
      payload?: Record<string, unknown>;
    };

    const p = body.payload || {};

    if (body.action === 'create') {
      const subjectId = String(p.subjectId || '');
      const classId = String(p.classId || '');
      const topic = String(p.topic || '').trim();
      const questionText = String(p.questionText || '').trim();
      const questionType = String(p.questionType || 'mcq') as QuestionType;
      const difficulty = String(p.difficulty || 'medium') as DifficultyLevel;
      const marks = Number(p.marks || 1);
      const imageUrl = p.imageUrl ? String(p.imageUrl).trim() : undefined;

      if (!subjectId || !classId || !topic || !questionText || marks <= 0) {
        return NextResponse.json(
          { error: 'Subject, class, topic, question text, and positive marks are required.' },
          { status: 400 }
        );
      }

      if (imageUrl && !isValidSafeUrl(imageUrl)) {
        return NextResponse.json({ error: 'Invalid or unsafe image URL.' }, { status: 400 });
      }

      const submitImmediately = Boolean(p.submitForApproval);
      const initialStatus: QuestionApprovalStatus =
        me.role === 'super_admin' && p.autoApprove
          ? 'approved'
          : submitImmediately
            ? 'submitted'
            : 'draft';

      const res = await mutateDb((db) => {
        // Teacher scope enforcement: verify class & subject assignment
        if (me.role === 'teacher') {
          const staff = db.staff.find((s) => s.profileId === me.id);
          const hasAssignment = staff
            ? db.teacherAssignments.some(
                (ta) =>
                  ta.staffId === staff.id &&
                  ta.subjectId === subjectId &&
                  ta.classId === classId
              )
            : false;
          if (!hasAssignment) {
            return {
              error:
                'You may only upload questions for classes and subjects assigned to your teaching profile.',
              status: 403 as const,
            };
          }
        }

        const now = new Date().toISOString();
        const qId = newId('q');
        const options = (p.options as QuestionOption[]) || [];
        const matchingPairs = (p.matchingPairs as MatchingPair[]) || undefined;
        const acceptedAnswers = (p.acceptedAnswers as string[]) || undefined;

        db.questions.unshift({
          id: qId,
          subjectId,
          classId,
          topic,
          subtopic: p.subtopic ? String(p.subtopic).trim() : undefined,
          difficulty,
          marks,
          questionType,
          questionText,
          options,
          matchingPairs,
          correctAnswer: p.correctAnswer as string | string[] | Record<string, string>,
          acceptedAnswers,
          explanation: p.explanation ? String(p.explanation).trim() : undefined,
          markingGuide: p.markingGuide ? String(p.markingGuide).trim() : undefined,
          imageUrl,
          teacherProfileId: me.id,
          approvalStatus: initialStatus,
          createdAt: now,
          updatedAt: now,
        });

        if (initialStatus === 'submitted') {
          const subject = db.subjects.find((s) => s.id === subjectId);
          for (const hodOrAdmin of db.profiles.filter(
            (pr) => pr.role === 'hod' || pr.role === 'super_admin'
          )) {
            db.notifications.unshift({
              id: newId('notif'),
              recipientProfileId: hodOrAdmin.id,
              title: 'New Question Submitted for Approval',
              message: `${me.fullName} submitted a ${subject?.name || 'Subject'} question (${topic}).`,
              category: 'question',
              isRead: false,
              linkView: 'questions',
              createdAt: now,
            });
          }
        }

        appendAuditLog(
          db,
          me,
          'QUESTION_CREATED',
          'question',
          qId,
          `Created ${questionType} question in ${topic} (${initialStatus}).`
        );

        return { status: 201 as const, questionId: qId };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, questionId: res.questionId }, { status: 201 });
    }

    if (body.action === 'bulk_import') {
      const subjectId = String(p.subjectId || '');
      const classId = String(p.classId || '');
      const csvText = String(p.csvText || '');
      const submitForApproval = Boolean(p.submitForApproval);
      const initialBulkStatus: QuestionApprovalStatus =
        me.role === 'super_admin' && p.autoApprove
          ? 'approved'
          : submitForApproval
            ? 'submitted'
            : 'draft';

      if (!subjectId || !classId || !csvText.trim()) {
        return NextResponse.json(
          { error: 'Subject, class, and CSV content are required.' },
          { status: 400 }
        );
      }

      const res = await mutateDb((db) => {
        if (me.role === 'teacher') {
          const staff = db.staff.find((s) => s.profileId === me.id);
          const hasAssignment = staff
            ? db.teacherAssignments.some(
                (ta) =>
                  ta.staffId === staff.id &&
                  ta.subjectId === subjectId &&
                  ta.classId === classId
              )
            : false;
          if (!hasAssignment) {
            return {
              error:
                'You may only bulk import questions for classes and subjects assigned to your teaching profile.',
              status: 403 as const,
            };
          }
        }

        const existingTexts = db.questions
          .filter((q) => q.subjectId === subjectId && q.classId === classId)
          .map((q) => q.questionText);
        const rows = parseCsvLines(csvText);
        const report = validateAndParseQuestionRows(rows, existingTexts);
        const now = new Date().toISOString();

        for (const item of report.successful) {
          db.questions.unshift({
            id: newId('q'),
            subjectId,
            classId,
            topic: item.topic,
            difficulty: item.difficulty,
            marks: item.marks,
            questionType: item.questionType,
            questionText: item.questionText,
            options: item.options,
            correctAnswer: item.correctAnswer,
            acceptedAnswers: item.acceptedAnswers,
            explanation: item.explanation,
            teacherProfileId: me.id,
            approvalStatus: initialBulkStatus,
            createdAt: now,
            updatedAt: now,
          });
        }

        appendAuditLog(
          db,
          me,
          'QUESTIONS_BULK_IMPORTED',
          'question',
          subjectId,
          `Imported ${report.successful.length} questions; ${report.failed.length} failed validation.`
        );

        return { report };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ report: res.report });
    }

    if (body.action === 'review') {
      if (!['super_admin', 'exam_officer', 'hod'].includes(me.role)) {
        return forbiddenResponse('Only HODs, Examination Officers, or Administrators can approve or reject questions.');
      }
      const questionId = String(p.questionId || '');
      const nextStatus = String(p.approvalStatus || '') as QuestionApprovalStatus;
      const comment = String(p.comment || '').trim();

      if (!questionId || !['under_review', 'approved', 'rejected', 'archived'].includes(nextStatus)) {
        return NextResponse.json({ error: 'Valid question ID and approval decision are required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const q = db.questions.find((item) => item.id === questionId);
        if (!q) return { error: 'Question not found.', status: 404 as const };
        const now = new Date().toISOString();
        q.approvalStatus = nextStatus;
        q.updatedAt = now;
        db.questionApprovals.unshift({
          id: newId('qa'),
          questionId: q.id,
          reviewerProfileId: me.id,
          action: nextStatus,
          comment,
          createdAt: now,
        });
        db.notifications.unshift({
          id: newId('notif'),
          recipientProfileId: q.teacherProfileId,
          title: `Question ${nextStatus.replace('_', ' ')}`,
          message: `Your question "${q.questionText.slice(0, 60)}..." was marked ${nextStatus}.`,
          category: 'question',
          isRead: false,
          createdAt: now,
        });
        appendAuditLog(
          db,
          me,
          'QUESTION_REVIEWED',
          'question',
          q.id,
          `Marked ${nextStatus}${comment ? ` — ${comment}` : ''}`
        );
        return { status: 200 as const };
      });

      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'update') {
      const questionId = String(p.questionId || '');
      const res = await mutateDb((db) => {
        const q = db.questions.find((item) => item.id === questionId);
        if (!q) return { error: 'Question not found.', status: 404 as const };
        if (me.role === 'teacher' && q.teacherProfileId !== me.id) {
          return { error: 'You may only edit your own questions.', status: 403 as const };
        }
        if (typeof p.questionText === 'string' && p.questionText.trim()) q.questionText = p.questionText.trim();
        if (typeof p.topic === 'string' && p.topic.trim()) q.topic = p.topic.trim();
        if (typeof p.marks === 'number' && p.marks > 0) q.marks = p.marks;
        if (typeof p.approvalStatus === 'string' && p.approvalStatus === 'submitted') {
          q.approvalStatus = 'submitted';
        }
        q.updatedAt = new Date().toISOString();
        appendAuditLog(db, me, 'QUESTION_UPDATED', 'question', q.id, `Edited question ${q.id}.`);
        return { status: 200 as const };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (body.action === 'delete') {
      if (me.role !== 'super_admin' && me.role !== 'teacher') {
        return forbiddenResponse();
      }
      const questionId = String(p.questionId || '');
      const res = await mutateDb((db) => {
        const idx = db.questions.findIndex((item) => item.id === questionId);
        if (idx === -1) return { error: 'Question not found.', status: 404 as const };
        if (me.role === 'teacher' && db.questions[idx].teacherProfileId !== me.id) {
          return { error: 'You may only remove your own unapproved questions.', status: 403 as const };
        }
        db.questions.splice(idx, 1);
        appendAuditLog(db, me, 'QUESTION_DELETED', 'question', questionId, `Removed question ${questionId}.`);
        return { status: 200 as const };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid question action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid question payload.' }, { status: 400 });
  }
}
