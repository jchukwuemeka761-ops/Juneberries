import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, unauthorizedResponse } from '@/lib/server/auth';
import { readDb, toPublicProfile } from '@/lib/server/db';
import { computeRemainingSeconds } from '@/lib/cbt-engine';
import { buildStudentClassReadiness } from '@/lib/portal-routing';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return unauthorizedResponse();
  }

  const data = await readDb((db) => {
    const me = toPublicProfile(auth.profile);
    const role = me.role;
    const notifications = db.notifications.filter(
      (n) => n.recipientProfileId === me.id
    );

    const base = {
      me,
      settings: db.settings,
      departments: db.departments,
      classes: db.classes,
      subjects: db.subjects,
      sessions: db.sessions,
      terms: db.terms,
      notifications,
    };

    if (role === 'student') {
      const student = db.students.find((s) => s.profileId === me.id) || null;
      const enrollments = student
        ? db.enrollments.filter((e) => e.studentId === student.id)
        : [];
      const myExams = student
        ? db.examinations.filter(
            (ex) =>
              (ex.classId === student.classId ||
                ex.assignedStudentIds.includes(student.id)) &&
              ex.status !== 'draft' &&
              ex.status !== 'archived'
          )
        : [];
      const myAttempts = student
        ? db.attempts
            .filter((a) => a.studentId === student.id)
            .map((a) => ({
              ...a,
              remainingSeconds: computeRemainingSeconds(a.deadlineAt),
            }))
        : [];
      // Only published results are visible to students
      const myResults = student
        ? db.results.filter(
            (r) => r.studentId === student.id && r.status === 'published'
          )
        : [];
      const teacherProfiles = db.profiles
        .filter((p) => p.role !== 'student')
        .map(toPublicProfile);
      const studentClassReadiness = student
        ? buildStudentClassReadiness(
            student.classId,
            db.subjects,
            db.questions,
            myExams
          )
        : [];

      return {
        ...base,
        studentRecord: student,
        enrollments,
        studentClassReadiness,
        examinations: myExams,
        attempts: myAttempts,
        results: myResults,
        staffProfiles: teacherProfiles,
      };
    }

    const myStaff = db.staff.find((s) => s.profileId === me.id) || null;
    const allPublicProfiles = db.profiles.map(toPublicProfile);

    if (role === 'invigilator') {
      const assignedExams = db.examinations.filter(
        (ex) =>
          ex.assignedInvigilatorProfileIds.length === 0 ||
          ex.assignedInvigilatorProfileIds.includes(me.id)
      );
      const assignedExamIds = new Set(assignedExams.map((e) => e.id));
      const attempts = db.attempts
        .filter((a) => assignedExamIds.has(a.examinationId))
        .map((a) => ({
          ...a,
          remainingSeconds: computeRemainingSeconds(a.deadlineAt),
        }));
      const incidents = db.incidents.filter((i) =>
        assignedExamIds.has(i.examinationId)
      );

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students,
        examinations: assignedExams,
        attempts,
        incidents,
      };
    }

    if (role === 'teacher') {
      const myAssignments = myStaff
        ? db.teacherAssignments.filter((ta) => ta.staffId === myStaff.id)
        : [];
      const assignedSubjectIds = new Set(myAssignments.map((a) => a.subjectId));
      const assignedClassIds = new Set(myAssignments.map((a) => a.classId));
      const assignedPairKeys = new Set(
        myAssignments.map((a) => `${a.classId}::${a.subjectId}`)
      );

      const scopedQuestions = db.questions.filter(
        (q) =>
          q.teacherProfileId === me.id ||
          assignedPairKeys.has(`${q.classId}::${q.subjectId}`)
      );
      const scopedExams = db.examinations.filter(
        (ex) =>
          ex.assignedTeacherProfileIds.includes(me.id) ||
          assignedPairKeys.has(`${ex.classId}::${ex.subjectId}`)
      );
      const scopedExamIds = new Set(scopedExams.map((e) => e.id));
      const scopedAttempts = db.attempts.filter((a) =>
        scopedExamIds.has(a.examinationId)
      );
      const scopedAttemptIds = new Set(scopedAttempts.map((a) => a.id));
      const scopedAnswers = db.answers.filter((ans) =>
        scopedAttemptIds.has(ans.attemptId)
      );
      const scopedResults = db.results.filter((r) =>
        scopedExamIds.has(r.examinationId)
      );

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students.filter((s) => assignedClassIds.has(s.classId)),
        staff: db.staff,
        teacherAssignments: myAssignments,
        questionBanks: db.questionBanks.filter(
          (qb) =>
            qb.createdByProfileId === me.id ||
            assignedSubjectIds.has(qb.subjectId)
        ),
        questions: scopedQuestions,
        questionApprovals: db.questionApprovals,
        examinations: scopedExams,
        examinationQuestions: db.examinationQuestions.filter((eq) =>
          scopedExamIds.has(eq.examinationId)
        ),
        attempts: scopedAttempts,
        answers: scopedAnswers,
        results: scopedResults,
      };
    }

    if (role === 'hod') {
      const deptId = myStaff?.departmentId;
      const deptSubjectIds = new Set(
        db.subjects
          .filter((s) => !deptId || s.departmentId === deptId)
          .map((s) => s.id)
      );
      const deptQuestions = db.questions.filter((q) =>
        deptSubjectIds.has(q.subjectId)
      );
      const deptExams = db.examinations.filter((ex) =>
        deptSubjectIds.has(ex.subjectId)
      );
      const deptExamIds = new Set(deptExams.map((e) => e.id));

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students,
        staff: db.staff.filter((s) => !deptId || s.departmentId === deptId),
        teacherAssignments: db.teacherAssignments.filter((ta) =>
          deptSubjectIds.has(ta.subjectId)
        ),
        questionBanks: db.questionBanks.filter((qb) =>
          deptSubjectIds.has(qb.subjectId)
        ),
        questions: deptQuestions,
        questionApprovals: db.questionApprovals,
        examinations: deptExams,
        examinationQuestions: db.examinationQuestions.filter((eq) =>
          deptExamIds.has(eq.examinationId)
        ),
        attempts: db.attempts.filter((a) => deptExamIds.has(a.examinationId)),
        results: db.results.filter((r) => deptSubjectIds.has(r.subjectId)),
      };
    }

    // super_admin, exam_officer, principal
    return {
      ...base,
      staffRecord: myStaff,
      profiles: allPublicProfiles,
      students: db.students,
      staff: db.staff,
      enrollments: db.enrollments,
      teacherAssignments: db.teacherAssignments,
      questionBanks: db.questionBanks,
      questions: role === 'principal' ? [] : db.questions,
      questionApprovals: db.questionApprovals,
      examinations: db.examinations,
      examinationQuestions: db.examinationQuestions,
      examinationAssignments: db.examinationAssignments,
      attempts: db.attempts.map((a) => ({
        ...a,
        remainingSeconds: computeRemainingSeconds(a.deadlineAt),
      })),
      answers: role === 'principal' ? [] : db.answers,
      results: db.results,
      resultApprovals: db.resultApprovals,
      incidents: db.incidents,
      auditLogs: role === 'super_admin' ? db.auditLogs : [],
    };
  });

  return NextResponse.json(data);
}
