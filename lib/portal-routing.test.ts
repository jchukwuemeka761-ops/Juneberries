import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStudentClassReadiness,
  buildTeacherOperationsRows,
  checkStaffAccountMutationGuard,
  validatePortalRoleAccess,
  validateStaffAssignments,
} from './portal-routing';
import type { AcademicClass, Subject } from './types';

const now = '2026-11-24T00:00:00.000Z';

const sampleClasses: AcademicClass[] = [
  {
    id: 'cls_jss3',
    name: 'JSS 3',
    code: 'JSS3',
    levelGroup: 'junior_secondary',
    levelOrder: 9,
    capacity: 40,
    isActive: true,
    createdAt: now,
  },
  {
    id: 'cls_sss2',
    name: 'SSS 2',
    code: 'SSS2',
    levelGroup: 'senior_secondary',
    levelOrder: 11,
    capacity: 40,
    isActive: true,
    createdAt: now,
  },
];

const sampleSubjects: Subject[] = [
  {
    id: 'sub_jss_math',
    name: 'Mathematics (JSS)',
    code: 'JSS-MTH',
    departmentId: 'dept_science',
    levelGroup: 'junior_secondary',
    applicableClassIds: ['cls_jss3'],
    isActive: true,
    createdAt: now,
  },
  {
    id: 'sub_sss_phy',
    name: 'Physics',
    code: 'SSS-PHY',
    departmentId: 'dept_science',
    levelGroup: 'senior_secondary',
    applicableClassIds: ['cls_sss2'],
    isActive: true,
    createdAt: now,
  },
];

test('validatePortalRoleAccess separates student, teacher, question upload, and admin portals', () => {
  assert.equal(validatePortalRoleAccess('student', 'student').allowed, true);
  assert.equal(validatePortalRoleAccess('student', 'admin').allowed, false);
  assert.equal(validatePortalRoleAccess('student', 'teacher').allowed, false);
  assert.equal(validatePortalRoleAccess('student', 'questions').allowed, false);

  assert.equal(validatePortalRoleAccess('teacher', 'teacher').allowed, true);
  assert.equal(validatePortalRoleAccess('teacher', 'questions').allowed, true);
  assert.equal(validatePortalRoleAccess('teacher', 'student').allowed, false);
  assert.equal(validatePortalRoleAccess('teacher', 'admin').allowed, false);

  assert.equal(validatePortalRoleAccess('super_admin', 'admin').allowed, true);
  assert.equal(validatePortalRoleAccess('super_admin', 'questions').allowed, true);
  assert.equal(validatePortalRoleAccess('principal', 'admin').allowed, true);
});

test('validateStaffAssignments deduplicates valid class-subject pairs and rejects cross-level mismatches', () => {
  const validRes = validateStaffAssignments(
    [
      { classId: 'cls_jss3', subjectId: 'sub_jss_math' },
      { classId: 'cls_jss3', subjectId: 'sub_jss_math' },
      { classId: 'cls_sss2', subjectId: 'sub_sss_phy' },
    ],
    sampleClasses,
    sampleSubjects
  );
  assert.equal(validRes.error, undefined);
  assert.equal(validRes.valid.length, 2);

  const mismatchRes = validateStaffAssignments(
    [{ classId: 'cls_jss3', subjectId: 'sub_sss_phy' }],
    sampleClasses,
    sampleSubjects
  );
  assert.ok(mismatchRes.error?.includes('not configured'));
});

test('buildStudentClassReadiness counts approved questions and active/scheduled exams per subject', () => {
  const readiness = buildStudentClassReadiness(
    'cls_sss2',
    sampleSubjects,
    [
      { classId: 'cls_sss2', subjectId: 'sub_sss_phy', approvalStatus: 'approved' },
      { classId: 'cls_sss2', subjectId: 'sub_sss_phy', approvalStatus: 'submitted' },
    ],
    [
      { classId: 'cls_sss2', subjectId: 'sub_sss_phy', status: 'active' },
      { classId: 'cls_sss2', subjectId: 'sub_sss_phy', status: 'scheduled' },
    ]
  );

  assert.equal(readiness.length, 1);
  assert.equal(readiness[0].subjectId, 'sub_sss_phy');
  assert.equal(readiness[0].approvedQuestionCount, 1);
  assert.equal(readiness[0].activeExamCount, 1);
  assert.equal(readiness[0].scheduledExamCount, 1);
});

test('buildTeacherOperationsRows aggregates teacher assignments and authored question metrics', () => {
  const rows = buildTeacherOperationsRows({
    staff: [
      {
        id: 'stf_1',
        profileId: 'prof_1',
        staffNumber: 'JBS/STF/010',
        departmentId: 'dept_science',
        designation: 'Physics Teacher',
        isSampleData: false,
        createdAt: now,
      },
    ],
    profiles: [
      {
        id: 'prof_1',
        email: 'ada@juneberryschools.edu.ng',
        fullName: 'Mrs. Ada Nwosu',
        role: 'teacher',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    teacherAssignments: [
      {
        id: 'ta_1',
        staffId: 'stf_1',
        classId: 'cls_sss2',
        subjectId: 'sub_sss_phy',
        sessionId: 'sess_1',
        createdAt: now,
      },
    ],
    classes: sampleClasses,
    subjects: sampleSubjects,
    departments: [{ id: 'dept_science', name: 'Science & Technology Department' }],
    questions: [
      {
        id: 'q1',
        subjectId: 'sub_sss_phy',
        classId: 'cls_sss2',
        topic: 'Optics',
        difficulty: 'medium',
        marks: 2,
        questionType: 'mcq',
        questionText: 'Sample?',
        options: [],
        correctAnswer: 'A',
        teacherProfileId: 'prof_1',
        approvalStatus: 'approved',
        createdAt: now,
        updatedAt: now,
      },
    ],
    examinations: [],
    auditLogs: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].assignedPairs[0].className, 'SSS 2');
  assert.equal(rows[0].approvedQuestions, 1);
});

test('checkStaffAccountMutationGuard protects self and last active super admin while allowing relief of other staff', () => {
  const profiles = [
    { id: 'admin_1', role: 'super_admin' as const, isActive: true },
    { id: 'teacher_1', role: 'teacher' as const, isActive: true },
  ];

  assert.equal(
    checkStaffAccountMutationGuard({
      actorProfileId: 'admin_1',
      targetProfile: profiles[0],
      allProfiles: profiles,
      operation: 'delete',
    }).allowed,
    false
  );

  assert.equal(
    checkStaffAccountMutationGuard({
      actorProfileId: 'admin_1',
      targetProfile: profiles[1],
      allProfiles: profiles,
      operation: 'deactivate',
    }).allowed,
    true
  );

  assert.equal(
    checkStaffAccountMutationGuard({
      actorProfileId: 'admin_1',
      targetProfile: profiles[1],
      allProfiles: profiles,
      operation: 'delete',
    }).allowed,
    true
  );
});

