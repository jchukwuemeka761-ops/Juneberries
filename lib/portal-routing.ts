import type {
  AcademicClass,
  AuditLog,
  Examination,
  ExaminationAttempt,
  ExaminationResult,
  PublicProfile,
  Question,
  StaffRecord,
  StudentRecord,
  Subject,
  TeacherAssignment,
  UserRole,
} from './types';

export type PortalScope =
  | 'gateway'
  | 'student'
  | 'student_register'
  | 'teacher'
  | 'teacher_register'
  | 'questions'
  | 'admin';

export interface PortalAccessCheck {
  allowed: boolean;
  error?: string;
  redirectPath?: string;
}

export function validatePortalRoleAccess(
  role: UserRole,
  portalScope?: PortalScope
): PortalAccessCheck {
  if (!portalScope || portalScope === 'gateway') {
    return { allowed: true };
  }

  if (portalScope === 'student' || portalScope === 'student_register') {
    if (role !== 'student') {
      return {
        allowed: false,
        error:
          role === 'teacher'
            ? 'This account is a Subject Teacher account. Please sign in through the Teacher Login Portal (/teacher).'
            : 'This account is a School Staff / Administrator account. Please sign in through the General Admin Portal (/admin).',
        redirectPath: role === 'teacher' ? '/teacher' : '/admin',
      };
    }
    return { allowed: true };
  }

  if (portalScope === 'teacher' || portalScope === 'teacher_register') {
    if (role === 'student') {
      return {
        allowed: false,
        error:
          'Student accounts cannot sign in on the Teacher Portal. Please use the Student Login Portal (/student).',
        redirectPath: '/student',
      };
    }
    if (!['teacher', 'hod', 'exam_officer', 'super_admin'].includes(role)) {
      return {
        allowed: false,
        error:
          'Executive and Invigilator accounts should sign in through the General Admin Portal (/admin).',
        redirectPath: '/admin',
      };
    }
    return { allowed: true };
  }

  if (portalScope === 'questions') {
    if (!['teacher', 'hod', 'exam_officer', 'super_admin'].includes(role)) {
      return {
        allowed: false,
        error:
          role === 'student'
            ? 'Students cannot access the Question Upload Portal. Please sign in at the Student Portal (/student).'
            : 'Only Subject Teachers, HODs, Exam Officers, and General Admins can upload questions.',
        redirectPath: role === 'student' ? '/student' : '/admin',
      };
    }
    return { allowed: true };
  }

  if (portalScope === 'admin') {
    if (role === 'student') {
      return {
        allowed: false,
        error:
          'Student accounts cannot access the General Admin Portal. Please use the Student Login Portal (/student).',
        redirectPath: '/student',
      };
    }
    if (role === 'teacher') {
      return {
        allowed: false,
        error:
          'Subject Teacher accounts use the Teacher Portal (/teacher) or Question Upload Portal (/questions). Only School Management / General Admin accounts sign in here.',
        redirectPath: '/teacher',
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

export interface ClassSubjectSelection {
  classId: string;
  subjectId: string;
}

export function validateStaffAssignments(
  selections: ClassSubjectSelection[],
  classes: AcademicClass[],
  subjects: Subject[]
): { valid: ClassSubjectSelection[]; error?: string } {
  if (!Array.isArray(selections) || selections.length === 0) {
    return {
      valid: [],
      error: 'Select at least one class and subject combination that you teach.',
    };
  }

  const classMap = new Map(classes.filter((c) => c.isActive).map((c) => [c.id, c]));
  const subjectMap = new Map(subjects.filter((s) => s.isActive).map((s) => [s.id, s]));
  const deduped = new Map<string, ClassSubjectSelection>();

  for (const item of selections) {
    const classId = String(item?.classId || '').trim();
    const subjectId = String(item?.subjectId || '').trim();
    if (!classId || !subjectId) continue;

    const cls = classMap.get(classId);
    const sub = subjectMap.get(subjectId);
    if (!cls || !sub) {
      return {
        valid: [],
        error: 'One or more selected classes or subjects are invalid or inactive.',
      };
    }

    if (
      sub.applicableClassIds.length > 0 &&
      !sub.applicableClassIds.includes(classId)
    ) {
      return {
        valid: [],
        error: `${sub.name} is not configured for ${cls.name}. Select matching subjects for each academic level.`,
      };
    }

    deduped.set(`${classId}::${subjectId}`, { classId, subjectId });
  }

  if (deduped.size === 0) {
    return {
      valid: [],
      error: 'Select at least one valid class and subject pair.',
    };
  }

  return { valid: Array.from(deduped.values()) };
}

export interface StudentClassAssessmentSummary {
  subjectId: string;
  subjectName: string;
  subjectCode: string;
  approvedQuestionCount: number;
  activeExamCount: number;
  scheduledExamCount: number;
}

export function buildStudentClassReadiness(
  classId: string,
  subjects: Subject[],
  questions: Pick<Question, 'classId' | 'subjectId' | 'approvalStatus'>[],
  examinations: Pick<Examination, 'classId' | 'subjectId' | 'status'>[]
): StudentClassAssessmentSummary[] {
  const classSubjects = subjects.filter(
    (s) => s.isActive && s.applicableClassIds.includes(classId)
  );

  return classSubjects.map((sub) => {
    const approvedQuestionCount = questions.filter(
      (q) =>
        q.classId === classId &&
        q.subjectId === sub.id &&
        q.approvalStatus === 'approved'
    ).length;

    const activeExamCount = examinations.filter(
      (e) =>
        e.classId === classId &&
        e.subjectId === sub.id &&
        (e.status === 'active' || e.status === 'rescheduled')
    ).length;

    const scheduledExamCount = examinations.filter(
      (e) =>
        e.classId === classId &&
        e.subjectId === sub.id &&
        e.status === 'scheduled'
    ).length;

    return {
      subjectId: sub.id,
      subjectName: sub.name,
      subjectCode: sub.code,
      approvedQuestionCount,
      activeExamCount,
      scheduledExamCount,
    };
  });
}

export interface TeacherOperationRow {
  staffId: string;
  profileId: string;
  fullName: string;
  email: string;
  staffNumber: string;
  role: UserRole;
  designation: string;
  departmentName: string;
  isActive: boolean;
  assignedPairs: Array<{ className: string; subjectName: string }>;
  totalQuestions: number;
  approvedQuestions: number;
  pendingQuestions: number;
  examsCreated: number;
  lastActionAt?: string;
}

export function buildTeacherOperationsRows(params: {
  staff: StaffRecord[];
  profiles: PublicProfile[];
  teacherAssignments: TeacherAssignment[];
  classes: AcademicClass[];
  subjects: Subject[];
  departments: Array<{ id: string; name: string }>;
  questions: Question[];
  examinations: Examination[];
  auditLogs: AuditLog[];
}): TeacherOperationRow[] {
  const classMap = new Map(params.classes.map((c) => [c.id, c]));
  const subjectMap = new Map(params.subjects.map((s) => [s.id, s]));
  const deptMap = new Map(params.departments.map((d) => [d.id, d.name]));

  return params.staff.map((st) => {
    const prof = params.profiles.find((p) => p.id === st.profileId);
    const assignments = params.teacherAssignments.filter((ta) => ta.staffId === st.id);
    const assignedPairs = assignments.map((ta) => ({
      className: classMap.get(ta.classId)?.name || ta.classId,
      subjectName: subjectMap.get(ta.subjectId)?.name || ta.subjectId,
    }));
    const authoredQuestions = params.questions.filter(
      (q) => q.teacherProfileId === st.profileId
    );
    const examsCreated = params.examinations.filter(
      (ex) => ex.createdByProfileId === st.profileId
    ).length;
    const latestAudit = params.auditLogs.find(
      (a) => a.actorProfileId === st.profileId
    );

    return {
      staffId: st.id,
      profileId: st.profileId,
      fullName: prof?.fullName || 'Staff Member',
      email: prof?.email || '',
      staffNumber: st.staffNumber,
      role: prof?.role || 'teacher',
      designation: st.designation,
      departmentName: (st.departmentId && deptMap.get(st.departmentId)) || 'General',
      isActive: prof?.isActive ?? false,
      assignedPairs,
      totalQuestions: authoredQuestions.length,
      approvedQuestions: authoredQuestions.filter((q) => q.approvalStatus === 'approved').length,
      pendingQuestions: authoredQuestions.filter(
        (q) => q.approvalStatus === 'submitted' || q.approvalStatus === 'under_review'
      ).length,
      examsCreated,
      lastActionAt: latestAudit?.createdAt,
    };
  });
}

export interface StudentOperationRow {
  studentId: string;
  profileId: string;
  fullName: string;
  email: string;
  admissionNumber: string;
  className: string;
  accountStatus: StudentRecord['accountStatus'];
  attemptsCount: number;
  inProgressCount: number;
  publishedResultsCount: number;
  averageScorePercent: number | null;
}

export function buildStudentOperationsRows(params: {
  students: StudentRecord[];
  profiles: PublicProfile[];
  classes: AcademicClass[];
  attempts: ExaminationAttempt[];
  results: ExaminationResult[];
}): StudentOperationRow[] {
  const classMap = new Map(params.classes.map((c) => [c.id, c.name]));

  return params.students.map((stu) => {
    const prof = params.profiles.find((p) => p.id === stu.profileId);
    const stuAttempts = params.attempts.filter((a) => a.studentId === stu.id);
    const stuResults = params.results.filter((r) => r.studentId === stu.id);
    const avg =
      stuResults.length > 0
        ? Math.round(
            (stuResults.reduce((sum, r) => sum + r.percentage, 0) / stuResults.length) *
              10
          ) / 10
        : null;

    return {
      studentId: stu.id,
      profileId: stu.profileId,
      fullName: prof?.fullName || 'Student',
      email: prof?.email || '',
      admissionNumber: stu.admissionNumber,
      className: classMap.get(stu.classId) || stu.classId,
      accountStatus: stu.accountStatus,
      attemptsCount: stuAttempts.length,
      inProgressCount: stuAttempts.filter((a) => a.status === 'in_progress').length,
      publishedResultsCount: stuResults.filter((r) => r.status === 'published').length,
      averageScorePercent: avg,
    };
  });
}

export function checkStaffAccountMutationGuard(params: {
  actorProfileId: string;
  targetProfile: Pick<PublicProfile, 'id' | 'role' | 'isActive'>;
  allProfiles: Array<Pick<PublicProfile, 'id' | 'role' | 'isActive'>>;
  operation: 'deactivate' | 'delete' | 'change_role';
  nextRole?: UserRole;
}): { allowed: boolean; error?: string } {
  const { actorProfileId, targetProfile, allProfiles, operation, nextRole } = params;

  if (
    targetProfile.id === actorProfileId &&
    (operation === 'deactivate' ||
      operation === 'delete' ||
      (operation === 'change_role' && nextRole && nextRole !== 'super_admin'))
  ) {
    return {
      allowed: false,
      error: 'You cannot deactivate, delete, or demote your own active Super Administrator account.',
    };
  }

  if (targetProfile.role === 'super_admin') {
    const otherActiveAdmins = allProfiles.filter(
      (p) => p.id !== targetProfile.id && p.role === 'super_admin' && p.isActive
    );
    const removesAdminAuthority =
      operation === 'delete' ||
      operation === 'deactivate' ||
      (operation === 'change_role' && nextRole !== 'super_admin');
    if (removesAdminAuthority && otherActiveAdmins.length === 0) {
      return {
        allowed: false,
        error: 'At least one active Super Administrator account must remain on the portal.',
      };
    }
  }

  return { allowed: true };
}

