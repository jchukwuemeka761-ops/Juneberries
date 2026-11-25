import type {
  AuditLog,
  DifficultyLevel,
  Examination,
  ExaminationAttempt,
  ExaminationStatus,
  ExaminationType,
  GradeBand,
  MatchingPair,
  Profile,
  PublicProfile,
  QuestionApprovalStatus,
  QuestionOption,
  QuestionType,
  SchoolDatabase,
  StudentAnswer,
  UserRole,
} from './types';
import {
  calculateResultTotals,
  computeRemainingSeconds,
  evaluateAnswer,
  isAttemptExpired,
  resolveGrade,
  roundScore,
  sanitizeQuestionForStudent,
  shuffleDeterministically,
} from './cbt-engine';
import { parseCsvLines, validateAndParseQuestionRows } from './bulk-import';
import {
  type ClassSubjectSelection,
  type PortalScope,
  buildStudentClassReadiness,
  checkStaffAccountMutationGuard,
  validatePortalRoleAccess,
  validateStaffAssignments,
} from './portal-routing';
import {
  hashPassword,
  isValidSafeUrl,
  signSessionToken,
  verifyPassword,
  verifySessionToken,
} from './browser-security';
import {
  applySampleSchoolSeed,
  buildStandardSessionsAndTerms,
  createInitialEmptyDb,
} from './browser-seed';

const DB_STORAGE_KEY = 'juneberries_cbt_db_v1';
const TOKEN_STORAGE_KEY = 'juneberries_cbt_token_v1';

let memoryDb: SchoolDatabase | null = null;
let memoryToken: string | null = null;

function newId(prefix: string): string {
  const uid =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 10)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefix}_${uid}`;
}

function ensureStandardSessionsAndTerms(db: SchoolDatabase): void {
  const { sessions, terms } = buildStandardSessionsAndTerms();
  for (const s of sessions) {
    if (!db.sessions.some((existing) => existing.id === s.id)) {
      db.sessions.push(s);
    }
  }
  for (const t of terms) {
    if (!db.terms.some((existing) => existing.id === t.id)) {
      db.terms.push(t);
    }
  }
  db.sessions.sort((a, b) => a.name.localeCompare(b.name));
}

function loadDb(): SchoolDatabase {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SchoolDatabase;
        ensureStandardSessionsAndTerms(parsed);
        memoryDb = parsed;
        return parsed;
      }
      const initial = createInitialEmptyDb();
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(initial));
      memoryDb = initial;
      return initial;
    }
  } catch {
    // Fallback to in-memory database
  }
  if (!memoryDb) {
    memoryDb = createInitialEmptyDb();
  }
  ensureStandardSessionsAndTerms(memoryDb);
  return memoryDb;
}

function saveDb(db: SchoolDatabase): void {
  memoryDb = db;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
    }
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function getStoredSessionToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored) {
        memoryToken = stored;
        return stored;
      }
    }
  } catch {
    // Ignore storage read failure
  }
  return null;
}

export function setStoredSessionToken(token: string | null): void {
  memoryToken = token;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage write failure
  }
}

function toPublicProfile(profile: Profile): PublicProfile {
  const { passwordHash: _omit, ...rest } = profile;
  void _omit;
  return rest;
}

function appendAuditLog(
  db: SchoolDatabase,
  actor: { id: string; fullName: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  details: string
): AuditLog {
  const entry: AuditLog = {
    id: newId('aud'),
    actorProfileId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
  return entry;
}

function authenticate(db: SchoolDatabase, explicitToken?: string | null): Profile | null {
  const token = explicitToken || getStoredSessionToken();
  if (!token) return null;
  const payload = verifySessionToken(token);
  if (!payload) return null;
  const profile = db.profiles.find((p) => p.id === payload.sub && p.isActive);
  return profile || null;
}

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

  const examLinks = db.examinationQuestions.filter((eq) => eq.examinationId === exam.id);
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

    let ans = db.answers.find((a) => a.attemptId === attempt.id && a.questionId === qId);
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

export function buildHealthPayload(explicitToken?: string | null) {
  const db = loadDb();
  const profile = authenticate(db, explicitToken);
  return {
    initialized: db.initialized,
    authenticated: Boolean(profile),
    requiresBootstrapPasscode: false,
    schoolName: db.settings.schoolName,
    motto: db.settings.motto,
    address: db.settings.address,
    email: db.settings.email,
    phone: db.settings.phone,
    logoUrl: db.settings.logoUrl,
    allowStudentSelfRegistration: db.settings.allowStudentSelfRegistration,
    requireAdminApprovalForStudents: db.settings.requireAdminApprovalForStudents,
    classes: db.classes
      .filter((c) => c.isActive)
      .sort((a, b) => a.levelOrder - b.levelOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        levelGroup: c.levelGroup,
      })),
    departments: db.departments
      .filter((d) => d.isActive)
      .map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
      })),
    subjects: db.subjects
      .filter((s) => s.isActive)
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        departmentId: s.departmentId,
        levelGroup: s.levelGroup,
        applicableClassIds: s.applicableClassIds,
      })),
    sessions: db.sessions,
    terms: db.terms,
    sampleEnabled: db.students.some((s) => s.isSampleData),
  };
}

export function dispatchLocalApi<T>(
  path: string,
  options: RequestInit = {},
  explicitToken?: string | null
): T {
  const cleanPath = path.split('?')[0] || path;
  const body = options.body ? (JSON.parse(String(options.body)) as Record<string, unknown>) : {};
  const db = loadDb();

  if (cleanPath === '/api/health') {
    return buildHealthPayload(explicitToken) as T;
  }

  if (cleanPath === '/api/results/check') {
    const admissionNumber = String(body.admissionNumber || '').trim().toUpperCase();
    const sessionId = String(body.sessionId || '').trim();
    const termName = String(body.termName || '').trim();

    if (!admissionNumber) {
      throw new Error('Enter your Student Exam or Registration Number (e.g. JBS/2026/002).');
    }

    const student = db.students.find(
      (s) => s.admissionNumber.toUpperCase() === admissionNumber
    );
    if (!student) {
      throw new Error(`No student record found matching "${admissionNumber}".`);
    }
    const profile = db.profiles.find((p) => p.id === student.profileId);
    const currentClass = db.classes.find((c) => c.id === student.classId);

    const matchedResults = db.results
      .filter((r) => {
        if (r.studentId !== student.id || r.status !== 'published') return false;
        if (sessionId && sessionId !== 'all' && r.sessionId !== sessionId) return false;
        if (termName && termName !== 'all') {
          const termObj = db.terms.find((t) => t.id === r.termId);
          if (!termObj || termObj.name !== termName) return false;
        }
        return true;
      })
      .map((r) => {
        const exam = db.examinations.find((e) => e.id === r.examinationId);
        const sub = db.subjects.find((s) => s.id === r.subjectId);
        const cls = db.classes.find((c) => c.id === r.classId);
        const sess = db.sessions.find((s) => s.id === r.sessionId);
        const term = db.terms.find((t) => t.id === r.termId);
        return {
          id: r.id,
          examTitle: exam?.title || 'CBT Examination',
          subjectName: sub?.name || 'Subject',
          sessionId: r.sessionId,
          sessionName: sess?.name || r.sessionId,
          termId: r.termId,
          termName: term?.name || 'Term',
          className: cls?.name || currentClass?.name || '',
          objectiveScore: r.objectiveScore,
          subjectiveScore: r.subjectiveScore,
          totalScore: r.totalScore,
          totalPossibleMarks: r.totalPossibleMarks,
          percentage: r.percentage,
          grade: r.grade,
          remark: r.remark,
          passed: r.passed,
          publishedAt: r.publishedAt,
        };
      });

    return {
      studentName: profile?.fullName || 'Student',
      admissionNumber: student.admissionNumber,
      className: currentClass?.name || '',
      schoolName: db.settings.schoolName,
      results: matchedResults,
    } as T;
  }

  if (cleanPath === '/api/auth/logout') {
    setStoredSessionToken(null);
    return { ok: true } as T;
  }

  if (cleanPath === '/api/auth/setup') {
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const seedSampleData = Boolean(body.seedSampleData);
    const sampleAccountPassword = String(body.sampleAccountPassword || password);

    if (!fullName || !email || !email.includes('@')) {
      throw new Error('Valid administrator full name and email address are required.');
    }
    if (password.length < 8) {
      throw new Error('Administrator password must be at least 8 characters.');
    }
    if (db.initialized) {
      throw new Error('Initial administrator setup has already been completed and locked.');
    }

    const now = new Date().toISOString();
    const adminProfileId = newId('prof_admin');
    const adminProfile: Profile = {
      id: adminProfileId,
      email,
      fullName,
      role: 'super_admin',
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };
    db.profiles.push(adminProfile);
    const adminStaffNo = db.staff.some((s) => s.staffNumber === 'JBS/STF/001')
      ? `JBS/ADM/${Math.floor(100 + Math.random() * 900)}`
      : 'JBS/STF/001';
    db.staff.push({
      id: newId('staff_admin'),
      profileId: adminProfileId,
      staffNumber: adminStaffNo,
      designation: 'General Administrator',
      isSampleData: false,
      createdAt: now,
    });

    if (seedSampleData) {
      applySampleSchoolSeed(db, sampleAccountPassword, adminProfileId);
    }

    db.initialized = true;
    appendAuditLog(
      db,
      { id: adminProfile.id, fullName: adminProfile.fullName, role: adminProfile.role },
      'ADMIN_BOOTSTRAP_CLAIMED',
      'profile',
      adminProfile.id,
      `Super Administrator account provisioned for ${adminProfile.email}.`
    );

    const token = signSessionToken({
      sub: adminProfile.id,
      role: adminProfile.role,
      email: adminProfile.email,
    });
    saveDb(db);
    setStoredSessionToken(token);
    return { token, profile: toPublicProfile(adminProfile) } as T;
  }

  if (cleanPath === '/api/auth/login') {
    const identifier = String(body.identifier || '').trim().toLowerCase();
    const password = String(body.password || '');
    const portalScope = body.portalScope as PortalScope | undefined;

    if (!identifier || !password) {
      throw new Error('Email, Admission Number, or Staff ID and password are required.');
    }

    let profile = db.profiles.find((p) => p.email.toLowerCase() === identifier);
    if (!profile) {
      const studentMatch = db.students.find((s) => s.admissionNumber.toLowerCase() === identifier);
      if (studentMatch) profile = db.profiles.find((p) => p.id === studentMatch.profileId);
    }
    if (!profile) {
      const staffMatch = db.staff.find((st) => st.staffNumber.toLowerCase() === identifier);
      if (staffMatch) profile = db.profiles.find((p) => p.id === staffMatch.profileId);
    }

    if (!profile || !verifyPassword(password, profile.passwordHash)) {
      throw new Error('Invalid login credentials.');
    }

    const scopeCheck = validatePortalRoleAccess(profile.role, portalScope);
    if (!scopeCheck.allowed) {
      throw new Error(scopeCheck.error || 'Please use the portal designated for your role.');
    }

    if (profile.role === 'student') {
      const stu = db.students.find((s) => s.profileId === profile!.id);
      if (stu && stu.accountStatus === 'pending_activation') {
        throw new Error('Your student account is awaiting administrator verification and activation.');
      }
      if (stu && stu.accountStatus === 'withdrawn') {
        throw new Error('This student account has been deactivated.');
      }
    }

    if (!profile.isActive) {
      throw new Error('Account is currently deactivated. Contact school administration.');
    }

    appendAuditLog(
      db,
      { id: profile.id, fullName: profile.fullName, role: profile.role },
      'USER_LOGIN',
      'profile',
      profile.id,
      `Signed in via ${identifier}`
    );

    const token = signSessionToken({
      sub: profile.id,
      role: profile.role,
      email: profile.email,
    });
    saveDb(db);
    setStoredSessionToken(token);

    return {
      token,
      profile: toPublicProfile(profile),
      studentRecord: db.students.find((s) => s.profileId === profile!.id) || null,
      staffRecord: db.staff.find((s) => s.profileId === profile!.id) || null,
    } as T;
  }

  if (cleanPath === '/api/auth/register-student') {
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const admissionNumber = String(body.admissionNumber || '').trim().toUpperCase();
    const classId = String(body.classId || '').trim();
    const password = String(body.password || '');

    if (!fullName || !email || !email.includes('@') || !admissionNumber || !classId) {
      throw new Error('Full name, valid email, unique admission number, and academic class are required.');
    }
    if (!/^[A-Z0-9][A-Z0-9/_-]{3,24}$/.test(admissionNumber)) {
      throw new Error(
        'Exam / Admission / Registration number must be 4–25 alphanumeric characters (e.g. JBS/2026/015 or EXM/2026/015).'
      );
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    if (!db.settings.allowStudentSelfRegistration) {
      throw new Error('Student self-registration is currently disabled by administration.');
    }
    if (db.profiles.some((p) => p.email.toLowerCase() === email)) {
      throw new Error('An account with this email address already exists.');
    }
    if (db.students.some((s) => s.admissionNumber.toUpperCase() === admissionNumber)) {
      throw new Error(`Admission number ${admissionNumber} is already registered.`);
    }
    const targetClass = db.classes.find((c) => c.id === classId && c.isActive);
    if (!targetClass) {
      throw new Error('Selected academic class does not exist.');
    }

    const now = new Date().toISOString();
    const requiresApproval = db.settings.requireAdminApprovalForStudents;
    const profileId = newId('prof_stu');
    const studentId = newId('stu');

    db.profiles.push({
      id: profileId,
      email,
      fullName,
      role: 'student',
      isActive: !requiresApproval,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });

    db.students.push({
      id: studentId,
      profileId,
      admissionNumber,
      classId,
      departmentId: String(body.departmentId || targetClass.departmentId || ''),
      gender: body.gender === 'Female' ? 'Female' : 'Male',
      guardianName: body.guardianName ? String(body.guardianName).trim() : undefined,
      guardianPhone: body.guardianPhone ? String(body.guardianPhone).trim() : undefined,
      accountStatus: requiresApproval ? 'pending_activation' : 'active',
      isSampleData: false,
      createdAt: now,
    });

    const currentSession = db.sessions.find((s) => s.isCurrent);
    const currentTerm = db.terms.find((t) => t.isCurrent);
    if (currentSession && currentTerm) {
      db.enrollments.push({
        id: newId('enr'),
        studentId,
        sessionId: currentSession.id,
        termId: currentTerm.id,
        classId,
        subjectIds: db.subjects
          .filter((sub) => sub.applicableClassIds.includes(classId))
          .map((sub) => sub.id),
        status: 'enrolled',
        createdAt: now,
      });
    }

    for (const admin of db.profiles.filter((p) => p.role === 'super_admin')) {
      db.notifications.unshift({
        id: newId('notif'),
        recipientProfileId: admin.id,
        title: 'New Student Registration',
        message: `${fullName} (${admissionNumber}) registered for ${targetClass.name}.`,
        category: 'account',
        isRead: false,
        linkView: 'admin-students',
        createdAt: now,
      });
    }

    appendAuditLog(
      db,
      { id: profileId, fullName, role: 'student' },
      'STUDENT_SELF_REGISTERED',
      'student',
      studentId,
      `Registered with admission number ${admissionNumber} (${requiresApproval ? 'pending activation' : 'active'}).`
    );

    saveDb(db);
    return {
      message: requiresApproval
        ? `Registration submitted for ${admissionNumber}. An administrator will verify your admission number and activate your portal access.`
        : `Account activated for ${admissionNumber}. You may now sign in.`,
      requiresApproval,
    } as T;
  }

  if (cleanPath === '/api/auth/register-staff') {
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const staffNumber = String(body.staffNumber || '').trim().toUpperCase();
    const departmentId = String(body.departmentId || '').trim();
    const designation = String(body.designation || 'Subject Teacher').trim();
    const password = String(body.password || '');
    const rawAssignments = Array.isArray(body.assignments)
      ? (body.assignments as ClassSubjectSelection[])
      : [];

    if (!fullName || !email || !email.includes('@') || !staffNumber || !departmentId) {
      throw new Error('Full name, valid email, unique Staff ID, and academic department are required.');
    }
    if (!/^[A-Z0-9][A-Z0-9/_-]{3,23}$/.test(staffNumber)) {
      throw new Error('Staff ID must be 4–24 alphanumeric characters (e.g. JBS/STF/015).');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    if (db.profiles.some((p) => p.email.toLowerCase() === email)) {
      throw new Error('An account with this email address already exists.');
    }
    if (db.staff.some((s) => s.staffNumber.toUpperCase() === staffNumber)) {
      throw new Error(`Staff ID ${staffNumber} is already registered.`);
    }

    const dept = db.departments.find((d) => d.id === departmentId && d.isActive);
    if (!dept) {
      throw new Error('Selected academic department is invalid.');
    }
    const checked = validateStaffAssignments(rawAssignments, db.classes, db.subjects);
    if (checked.error || checked.valid.length === 0) {
      throw new Error(checked.error || 'Select at least one class and subject.');
    }

    const now = new Date().toISOString();
    const profileId = newId('prof_stf');
    const staffId = newId('staff');
    const currentSessionId =
      db.sessions.find((s) => s.isCurrent)?.id || db.sessions[0]?.id || 'sess_2026_2027';

    db.profiles.push({
      id: profileId,
      email,
      fullName,
      role: 'teacher',
      isActive: true,
      passwordHash: hashPassword(password),
      createdAt: now,
      updatedAt: now,
    });
    db.staff.push({
      id: staffId,
      profileId,
      staffNumber,
      departmentId: dept.id,
      designation,
      isSampleData: false,
      createdAt: now,
    });

    for (const pair of checked.valid) {
      db.teacherAssignments.push({
        id: newId('ta'),
        staffId,
        classId: pair.classId,
        subjectId: pair.subjectId,
        sessionId: currentSessionId,
        createdAt: now,
      });
    }

    const summaryLabels = checked.valid
      .map((pair) => {
        const c = db.classes.find((x) => x.id === pair.classId)?.name || pair.classId;
        const s = db.subjects.find((x) => x.id === pair.subjectId)?.name || pair.subjectId;
        return `${c} (${s})`;
      })
      .slice(0, 6)
      .join(', ');

    for (const admin of db.profiles.filter((p) => p.role === 'super_admin')) {
      db.notifications.unshift({
        id: newId('notif'),
        recipientProfileId: admin.id,
        title: 'New Subject Teacher Registered',
        message: `${fullName} (${staffNumber}) registered for ${summaryLabels}${checked.valid.length > 6 ? '...' : ''}.`,
        category: 'account',
        isRead: false,
        linkView: 'operations',
        createdAt: now,
      });
    }

    appendAuditLog(
      db,
      { id: profileId, fullName, role: 'teacher' },
      'STAFF_SELF_REGISTERED',
      'staff',
      staffId,
      `Registered staff ${staffNumber} in ${dept.name} with ${checked.valid.length} class-subject assignment(s).`
    );

    saveDb(db);
    return {
      message: `Teacher account created for ${staffNumber} with ${checked.valid.length} class & subject assignment(s). You can now sign in to set questions for your classes.`,
      staffNumber,
    } as T;
  }

  if (cleanPath === '/api/auth/password') {
    const action = String(body.action || '');
    if (action === 'change_password') {
      const me = authenticate(db, explicitToken);
      if (!me) throw new Error('Authentication required.');
      const currentPassword = String(body.currentPassword || '');
      const newPassword = String(body.newPassword || '');
      if (!currentPassword || newPassword.length < 8) {
        throw new Error('Current password and a new password (min 8 chars) are required.');
      }
      if (!verifyPassword(currentPassword, me.passwordHash)) {
        throw new Error('Current password is incorrect.');
      }
      me.passwordHash = hashPassword(newPassword);
      me.mustChangePassword = false;
      me.updatedAt = new Date().toISOString();
      appendAuditLog(db, me, 'PASSWORD_CHANGED', 'profile', me.id, 'User updated their account password.');
      saveDb(db);
      return { message: 'Password updated successfully.' } as T;
    }

    if (action === 'request_reset') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) throw new Error('Account email is required.');
      const prof = db.profiles.find((p) => p.email.toLowerCase() === email);
      if (prof) {
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
        db.passwordResetTokens.push({
          id: newId('prt'),
          profileId: prof.id,
          token: code,
          expiresAt,
          used: false,
        });
        for (const admin of db.profiles.filter((p) => p.role === 'super_admin')) {
          db.notifications.unshift({
            id: newId('notif'),
            recipientProfileId: admin.id,
            title: 'Password Reset Requested',
            message: `${prof.fullName} (${prof.email}) requested a password reset. Verification code: ${code}`,
            category: 'account',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
        saveDb(db);
      }
      return {
        message:
          'If an account matches that email, a reset request has been logged for verification with your school administrator.',
      } as T;
    }

    if (action === 'confirm_reset') {
      const email = String(body.email || '').trim().toLowerCase();
      const resetCode = String(body.code || body.resetCode || '').trim();
      const newPassword = String(body.newPassword || '');
      if (!email || !resetCode || newPassword.length < 8) {
        throw new Error('Email, 6-digit verification code, and new password (min 8 chars) are required.');
      }
      const prof = db.profiles.find((p) => p.email.toLowerCase() === email);
      if (!prof) throw new Error('Invalid email or reset code.');
      const tokenRec = db.passwordResetTokens.find(
        (t) =>
          t.profileId === prof.id &&
          t.token === resetCode &&
          !t.used &&
          new Date(t.expiresAt).getTime() > Date.now()
      );
      if (!tokenRec) throw new Error('Reset code is invalid or expired.');
      tokenRec.used = true;
      prof.passwordHash = hashPassword(newPassword);
      prof.updatedAt = new Date().toISOString();
      appendAuditLog(db, prof, 'PASSWORD_RESET_COMPLETED', 'profile', prof.id, 'Password reset verified with one-time code.');
      saveDb(db);
      return { message: 'Password reset completed. You may now sign in.' } as T;
    }
    throw new Error('Unsupported password action.');
  }

  // All endpoints below require authentication
  const me = authenticate(db, explicitToken);
  if (!me) {
    throw new Error('Authentication required.');
  }

  if (cleanPath === '/api/portal/bootstrap') {
    const pubMe = toPublicProfile(me);
    const role = pubMe.role;
    const notifications = db.notifications.filter((n) => n.recipientProfileId === pubMe.id);
    const base = {
      me: pubMe,
      settings: db.settings,
      departments: db.departments,
      classes: db.classes,
      subjects: db.subjects,
      sessions: db.sessions,
      terms: db.terms,
      notifications,
    };

    if (role === 'student') {
      const student = db.students.find((s) => s.profileId === pubMe.id) || null;
      const enrollments = student ? db.enrollments.filter((e) => e.studentId === student.id) : [];
      const myExams = student
        ? db.examinations.filter(
            (ex) =>
              (ex.classId === student.classId || ex.assignedStudentIds.includes(student.id)) &&
              ex.status !== 'draft' &&
              ex.status !== 'archived'
          )
        : [];
      const myAttempts = student
        ? db.attempts
            .filter((a) => a.studentId === student.id)
            .map((a) => ({ ...a, remainingSeconds: computeRemainingSeconds(a.deadlineAt) }))
        : [];
      const myResults = student
        ? db.results.filter((r) => r.studentId === student.id && r.status === 'published')
        : [];
      const teacherProfiles = db.profiles.filter((p) => p.role !== 'student').map(toPublicProfile);
      const studentClassReadiness = student
        ? buildStudentClassReadiness(student.classId, db.subjects, db.questions, myExams)
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
      } as T;
    }

    const myStaff = db.staff.find((s) => s.profileId === pubMe.id) || null;
    const allPublicProfiles = db.profiles.map(toPublicProfile);

    if (role === 'invigilator') {
      const assignedExams = db.examinations.filter(
        (ex) =>
          ex.assignedInvigilatorProfileIds.length === 0 ||
          ex.assignedInvigilatorProfileIds.includes(pubMe.id)
      );
      const assignedExamIds = new Set(assignedExams.map((e) => e.id));
      const attempts = db.attempts
        .filter((a) => assignedExamIds.has(a.examinationId))
        .map((a) => ({ ...a, remainingSeconds: computeRemainingSeconds(a.deadlineAt) }));
      const incidents = db.incidents.filter((i) => assignedExamIds.has(i.examinationId));

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students,
        examinations: assignedExams,
        attempts,
        incidents,
      } as T;
    }

    if (role === 'teacher') {
      const myAssignments = myStaff
        ? db.teacherAssignments.filter((ta) => ta.staffId === myStaff.id)
        : [];
      const assignedSubjectIds = new Set(myAssignments.map((a) => a.subjectId));
      const assignedClassIds = new Set(myAssignments.map((a) => a.classId));
      const assignedPairKeys = new Set(myAssignments.map((a) => `${a.classId}::${a.subjectId}`));

      const scopedQuestions = db.questions.filter(
        (q) => q.teacherProfileId === pubMe.id || assignedPairKeys.has(`${q.classId}::${q.subjectId}`)
      );
      const scopedExams = db.examinations.filter(
        (ex) =>
          ex.assignedTeacherProfileIds.includes(pubMe.id) ||
          assignedPairKeys.has(`${ex.classId}::${ex.subjectId}`)
      );
      const scopedExamIds = new Set(scopedExams.map((e) => e.id));
      const scopedAttempts = db.attempts.filter((a) => scopedExamIds.has(a.examinationId));
      const scopedAttemptIds = new Set(scopedAttempts.map((a) => a.id));

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students.filter((s) => assignedClassIds.has(s.classId)),
        staff: db.staff,
        teacherAssignments: myAssignments,
        questionBanks: db.questionBanks.filter(
          (qb) => qb.createdByProfileId === pubMe.id || assignedSubjectIds.has(qb.subjectId)
        ),
        questions: scopedQuestions,
        questionApprovals: db.questionApprovals,
        examinations: scopedExams,
        examinationQuestions: db.examinationQuestions.filter((eq) =>
          scopedExamIds.has(eq.examinationId)
        ),
        attempts: scopedAttempts,
        answers: db.answers.filter((ans) => scopedAttemptIds.has(ans.attemptId)),
        results: db.results.filter((r) => scopedExamIds.has(r.examinationId)),
      } as T;
    }

    if (role === 'hod') {
      const deptId = myStaff?.departmentId;
      const deptSubjectIds = new Set(
        db.subjects.filter((s) => !deptId || s.departmentId === deptId).map((s) => s.id)
      );
      const deptQuestions = db.questions.filter((q) => deptSubjectIds.has(q.subjectId));
      const deptExams = db.examinations.filter((ex) => deptSubjectIds.has(ex.subjectId));
      const deptExamIds = new Set(deptExams.map((e) => e.id));

      return {
        ...base,
        staffRecord: myStaff,
        profiles: allPublicProfiles,
        students: db.students,
        staff: db.staff.filter((s) => !deptId || s.departmentId === deptId),
        teacherAssignments: db.teacherAssignments.filter((ta) => deptSubjectIds.has(ta.subjectId)),
        questionBanks: db.questionBanks.filter((qb) => deptSubjectIds.has(qb.subjectId)),
        questions: deptQuestions,
        questionApprovals: db.questionApprovals,
        examinations: deptExams,
        examinationQuestions: db.examinationQuestions.filter((eq) => deptExamIds.has(eq.examinationId)),
        attempts: db.attempts.filter((a) => deptExamIds.has(a.examinationId)),
        results: db.results.filter((r) => deptSubjectIds.has(r.subjectId)),
      } as T;
    }

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
    } as T;
  }

  if (cleanPath === '/api/questions') {
    if (!['super_admin', 'exam_officer', 'hod', 'teacher'].includes(me.role)) {
      throw new Error('Only academic staff may manage the question bank.');
    }
    const action = String(body.action || '');
    const p = (body.payload as Record<string, unknown>) || {};

    if (action === 'create') {
      const subjectId = String(p.subjectId || '');
      const classId = String(p.classId || '');
      const topic = String(p.topic || '').trim();
      const questionText = String(p.questionText || '').trim();
      const questionType = String(p.questionType || 'mcq') as QuestionType;
      const difficulty = String(p.difficulty || 'medium') as DifficultyLevel;
      const marks = Number(p.marks || 1);
      const imageUrl = p.imageUrl ? String(p.imageUrl).trim() : undefined;

      if (!subjectId || !classId || !topic || !questionText || marks <= 0) {
        throw new Error('Subject, class, topic, question text, and positive marks are required.');
      }
      if (imageUrl && !isValidSafeUrl(imageUrl)) {
        throw new Error('Invalid or unsafe image URL.');
      }

      if (me.role === 'teacher') {
        const staff = db.staff.find((s) => s.profileId === me.id);
        const hasAssignment = staff
          ? db.teacherAssignments.some(
              (ta) => ta.staffId === staff.id && ta.subjectId === subjectId && ta.classId === classId
            )
          : false;
        if (!hasAssignment) {
          throw new Error(
            'You may only upload questions for classes and subjects assigned to your teaching profile.'
          );
        }
      }

      const submitImmediately = Boolean(p.submitForApproval);
      const initialStatus: QuestionApprovalStatus =
        me.role === 'super_admin' && p.autoApprove
          ? 'approved'
          : submitImmediately
            ? 'submitted'
            : 'draft';

      const now = new Date().toISOString();
      const qId = newId('q');
      db.questions.unshift({
        id: qId,
        subjectId,
        classId,
        sessionId: p.sessionId ? String(p.sessionId) : undefined,
        termId: p.termId ? String(p.termId) : undefined,
        topic,
        subtopic: p.subtopic ? String(p.subtopic).trim() : undefined,
        difficulty,
        marks,
        questionType,
        questionText,
        options: (p.options as QuestionOption[]) || [],
        matchingPairs: (p.matchingPairs as MatchingPair[]) || undefined,
        correctAnswer: p.correctAnswer as string | string[] | Record<string, string>,
        acceptedAnswers: (p.acceptedAnswers as string[]) || undefined,
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
      saveDb(db);
      return { ok: true, questionId: qId } as T;
    }

    if (action === 'batch_document_import') {
      const subjectId = String(p.subjectId || '');
      const classId = String(p.classId || '');
      const sessionId = String(p.sessionId || db.sessions.find((s) => s.isCurrent)?.id || 'sess_2026_2027');
      const termId = String(p.termId || db.terms.find((t) => t.sessionId === sessionId)?.id || 'term_1');
      const items = (p.questions as Array<Record<string, unknown>>) || [];
      const examConfig = (p.examConfig as Record<string, unknown>) || null;
      const submitForApproval = Boolean(p.submitForApproval ?? true);

      if (!subjectId || !classId || items.length === 0) {
        throw new Error('Subject, class, and at least one parsed question are required.');
      }

      if (me.role === 'teacher') {
        const staff = db.staff.find((s) => s.profileId === me.id);
        const hasAssignment = staff
          ? db.teacherAssignments.some(
              (ta) => ta.staffId === staff.id && ta.subjectId === subjectId && ta.classId === classId
            )
          : false;
        if (!hasAssignment) {
          throw new Error(
            'You may only import template questions for classes and subjects assigned to your teaching profile.'
          );
        }
      }

      const now = new Date().toISOString();
      const createdQuestionIds: string[] = [];
      let totalMarks = 0;

      // Teachers building a live CBT exam from an Exam Template have their imported items ready immediately
      const targetApproval: QuestionApprovalStatus =
        me.role === 'super_admin' || examConfig?.createExam
          ? 'approved'
          : submitForApproval
            ? 'submitted'
            : 'draft';

      for (const item of items) {
        const qId = newId('q');
        const marks = Math.max(1, Number(item.marks || 2));
        totalMarks += marks;
        db.questions.unshift({
          id: qId,
          subjectId,
          classId,
          sessionId,
          termId,
          topic: String(item.topic || 'Template Import').trim(),
          difficulty: (String(item.difficulty || 'medium') as DifficultyLevel) || 'medium',
          marks,
          questionType: String(item.questionType || 'mcq') as QuestionType,
          questionText: String(item.questionText || '').trim(),
          options: (item.options as QuestionOption[]) || [],
          correctAnswer: item.correctAnswer as string | string[],
          acceptedAnswers: (item.acceptedAnswers as string[]) || undefined,
          explanation: item.explanation ? String(item.explanation).trim() : undefined,
          teacherProfileId: me.id,
          approvalStatus: targetApproval,
          createdAt: now,
          updatedAt: now,
        });
        createdQuestionIds.push(qId);
      }

      let createdExamId: string | null = null;
      if (examConfig?.createExam) {
        const examTitle = String(examConfig.title || '').trim();
        if (!examTitle) {
          throw new Error('Enter an Examination / Test Title to publish the CBT exam from this template.');
        }
        const examId = newId('exam');
        createdExamId = examId;
        const durationMinutes = Math.max(5, Number(examConfig.durationMinutes || 30));
        const passMarkPercent = Math.max(1, Math.min(100, Number(examConfig.passMarkPercent || 50)));
        const examType = String(examConfig.examType || 'continuous_assessment') as ExaminationType;
        const examDate = String(examConfig.examDate || new Date().toISOString().slice(0, 10));
        const autoPublish = examConfig.autoPublishObjectiveResults !== false;

        const classStudents = db.students.filter(
          (s) => s.classId === classId && s.accountStatus === 'active'
        );
        const assignedStudentIds = classStudents.map((s) => s.id);

        db.examinations.unshift({
          id: examId,
          title: examTitle,
          sessionId,
          termId,
          classId,
          subjectId,
          examType,
          examDate,
          startTime: '08:00',
          endTime: '20:00',
          durationMinutes,
          totalMarks,
          questionCount: createdQuestionIds.length,
          passMarkPercent,
          maxAttempts: 2,
          instructions: db.settings.defaultInstructions,
          assignedStudentIds,
          assignedTeacherProfileIds: [me.id],
          assignedInvigilatorProfileIds: [],
          randomiseQuestions: Boolean(examConfig.randomiseQuestions ?? true),
          randomiseOptions: Boolean(examConfig.randomiseOptions ?? true),
          restrictNavigation: false,
          enableNegativeMarking: false,
          negativeMarkPenalty: 0,
          autoPublishObjectiveResults: autoPublish,
          status: 'active',
          createdByProfileId: me.id,
          createdAt: now,
          updatedAt: now,
        });

        createdQuestionIds.forEach((qId, idx) => {
          db.examinationQuestions.push({
            id: newId('eq'),
            examinationId: examId,
            questionId: qId,
            orderIndex: idx,
          });
        });

        for (const stu of classStudents) {
          db.examinationAssignments.push({
            id: newId('ea'),
            examinationId: examId,
            studentId: stu.id,
            eligible: true,
            createdAt: now,
          });
          db.notifications.unshift({
            id: newId('notif'),
            recipientProfileId: stu.profileId,
            title: `New CBT Test Ready: ${examTitle}`,
            message: `${createdQuestionIds.length} auto-marked questions · Duration: ${durationMinutes} mins.`,
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
        'TEMPLATE_DOCUMENT_IMPORTED',
        'question',
        subjectId,
        `Imported ${createdQuestionIds.length} template question(s)${createdExamId ? ` and published active CBT exam ${createdExamId}` : ''}.`
      );
      saveDb(db);
      return {
        ok: true,
        importedCount: createdQuestionIds.length,
        createdExamId,
      } as T;
    }

    if (action === 'bulk_import') {
      const subjectId = String(p.subjectId || '');
      const classId = String(p.classId || '');
      const sessionId = p.sessionId ? String(p.sessionId) : undefined;
      const termId = p.termId ? String(p.termId) : undefined;
      const csvText = String(p.csvText || '');
      const submitForApproval = Boolean(p.submitForApproval);
      const initialBulkStatus: QuestionApprovalStatus =
        me.role === 'super_admin' && p.autoApprove
          ? 'approved'
          : submitForApproval
            ? 'submitted'
            : 'draft';

      if (!subjectId || !classId || !csvText.trim()) {
        throw new Error('Subject, class, and CSV content are required.');
      }

      if (me.role === 'teacher') {
        const staff = db.staff.find((s) => s.profileId === me.id);
        const hasAssignment = staff
          ? db.teacherAssignments.some(
              (ta) => ta.staffId === staff.id && ta.subjectId === subjectId && ta.classId === classId
            )
          : false;
        if (!hasAssignment) {
          throw new Error(
            'You may only bulk import questions for classes and subjects assigned to your teaching profile.'
          );
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
          sessionId,
          termId,
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
      saveDb(db);
      return { report } as T;
    }

    if (action === 'review') {
      if (!['super_admin', 'exam_officer', 'hod'].includes(me.role)) {
        throw new Error('Only HODs, Examination Officers, or Administrators can approve or reject questions.');
      }
      const questionId = String(p.questionId || '');
      const nextStatus = String(p.approvalStatus || '') as QuestionApprovalStatus;
      const comment = String(p.comment || '').trim();
      if (!questionId || !['under_review', 'approved', 'rejected', 'archived'].includes(nextStatus)) {
        throw new Error('Valid question ID and approval decision are required.');
      }
      const q = db.questions.find((item) => item.id === questionId);
      if (!q) throw new Error('Question not found.');
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
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'update') {
      const questionId = String(p.questionId || '');
      const q = db.questions.find((item) => item.id === questionId);
      if (!q) throw new Error('Question not found.');
      if (me.role === 'teacher' && q.teacherProfileId !== me.id) {
        throw new Error('You may only edit your own questions.');
      }
      if (typeof p.questionText === 'string' && p.questionText.trim()) q.questionText = p.questionText.trim();
      if (typeof p.topic === 'string' && p.topic.trim()) q.topic = p.topic.trim();
      if (typeof p.marks === 'number' && p.marks > 0) q.marks = p.marks;
      if (p.approvalStatus === 'submitted') q.approvalStatus = 'submitted';
      q.updatedAt = new Date().toISOString();
      appendAuditLog(db, me, 'QUESTION_UPDATED', 'question', q.id, `Edited question ${q.id}.`);
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'delete') {
      if (me.role !== 'super_admin' && me.role !== 'teacher') {
        throw new Error('Insufficient permissions to delete question.');
      }
      const questionId = String(p.questionId || '');
      const idx = db.questions.findIndex((item) => item.id === questionId);
      if (idx === -1) throw new Error('Question not found.');
      if (me.role === 'teacher' && db.questions[idx].teacherProfileId !== me.id) {
        throw new Error('You may only remove your own questions.');
      }
      db.questions.splice(idx, 1);
      appendAuditLog(db, me, 'QUESTION_DELETED', 'question', questionId, `Removed question ${questionId}.`);
      saveDb(db);
      return { ok: true } as T;
    }

    throw new Error('Invalid question action.');
  }

  if (cleanPath === '/api/exams') {
    if (!['super_admin', 'exam_officer', 'teacher'].includes(me.role)) {
      throw new Error('Only administrators, examination officers, or teachers may manage examinations.');
    }
    const action = String(body.action || '');
    const p = (body.payload as Record<string, unknown>) || {};

    if (action === 'create') {
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
        throw new Error('Title, class, subject, date, and positive duration are required.');
      }
      if (me.role === 'teacher') {
        const staff = db.staff.find((s) => s.profileId === me.id);
        const hasAssignment = staff
          ? db.teacherAssignments.some(
              (ta) => ta.staffId === staff.id && ta.classId === classId && ta.subjectId === subjectId
            )
          : false;
        if (!hasAssignment) {
          throw new Error(
            'You may only create quizzes, tests, or exams for classes and subjects assigned to your profile.'
          );
        }
      }

      const allowUnapproved = me.role === 'super_admin' && db.settings.allowUnapprovedQuestionsByAdmin;
      const isTeacherOwn = me.role === 'teacher';

      const eligiblePool = db.questions.filter(
        (q) =>
          q.subjectId === subjectId &&
          q.classId === classId &&
          (allowUnapproved ||
            q.approvalStatus === 'approved' ||
            (isTeacherOwn &&
              q.teacherProfileId === me.id &&
              q.approvalStatus !== 'rejected' &&
              q.approvalStatus !== 'archived'))
      );

      let chosenQuestions = eligiblePool.filter((q) => selectedQuestionIds.includes(q.id));
      if (chosenQuestions.length === 0 && autoSelectCount > 0) {
        const topicFiltered = autoSelectTopic
          ? eligiblePool.filter((q) =>
              q.topic.toLowerCase().includes(autoSelectTopic.toLowerCase())
            )
          : eligiblePool;
        chosenQuestions = topicFiltered.slice(0, autoSelectCount);
      }

      if (chosenQuestions.length === 0) {
        throw new Error(
          isTeacherOwn
            ? 'Select at least one submitted or approved question for this class and subject.'
            : 'Select at least one approved question from the Question Bank for this class and subject.'
        );
      }

      const now = new Date().toISOString();
      const examId = newId('exam');
      const resolvedSessionId =
        sessionId || db.sessions.find((s) => s.isCurrent)?.id || 'sess_2026_2027';
      const resolvedTermId = termId || db.terms.find((t) => t.isCurrent)?.id || 'term_1';
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
        instructions: String(p.instructions || '').trim() || db.settings.defaultInstructions,
        assignedStudentIds,
        assignedTeacherProfileIds: (p.assignedTeacherProfileIds as string[]) || [me.id],
        assignedInvigilatorProfileIds: (p.assignedInvigilatorProfileIds as string[]) || [],
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
      saveDb(db);
      return { ok: true, examId } as T;
    }

    if (action === 'update_status' || action === 'reschedule') {
      if (!['super_admin', 'exam_officer'].includes(me.role)) {
        throw new Error('Only Examination Officers or Super Admins can reschedule or change exam status.');
      }
      const examId = String(p.examId || '');
      const ex = db.examinations.find((e) => e.id === examId);
      if (!ex) throw new Error('Examination not found.');
      if (action === 'update_status') {
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
      saveDb(db);
      return { ok: true } as T;
    }

    throw new Error('Invalid exam action.');
  }

  if (cleanPath === '/api/cbt') {
    const action = String(body.action || '');
    const p = (body.payload as Record<string, unknown>) || {};

    if (action === 'record_incident') {
      const examinationId = String(p.examinationId || '');
      const attemptId = p.attemptId ? String(p.attemptId) : undefined;
      const eventType = String(p.eventType || 'tab_switch') as
        | 'tab_switch'
        | 'focus_loss'
        | 'page_refresh'
        | 'network_drop'
        | 'invigilator_report';
      const description = String(p.description || '').trim();
      if (me.role === 'student' && eventType === 'invigilator_report') {
        throw new Error('Forbidden incident type.');
      }

      const now = new Date().toISOString();
      let targetStudentId = p.studentId ? String(p.studentId) : undefined;
      if (attemptId) {
        const att = db.attempts.find((a) => a.id === attemptId);
        if (att) {
          if (me.role === 'student') {
            const stu = db.students.find((s) => s.profileId === me.id);
            if (!stu || stu.id !== att.studentId) throw new Error('Forbidden attempt access.');
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
      saveDb(db);
      return { ok: true, autoSubmitted: false } as T;
    }

    if (me.role !== 'student') {
      throw new Error('Only authenticated students can take CBT examinations.');
    }

    if (action === 'start_exam') {
      const examinationId = String(p.examinationId || '');
      if (!examinationId) throw new Error('Examination ID is required.');
      const student = db.students.find((s) => s.profileId === me.id);
      if (!student || student.accountStatus !== 'active') {
        throw new Error('Your student account is not active.');
      }
      const exam = db.examinations.find((e) => e.id === examinationId);
      if (!exam) throw new Error('Examination not found.');

      const isEligible =
        exam.classId === student.classId || exam.assignedStudentIds.includes(student.id);
      if (!isEligible) throw new Error('You are not enrolled or eligible for this examination.');
      if (exam.status !== 'active' && exam.status !== 'rescheduled') {
        throw new Error(`This examination is currently ${exam.status} and cannot be started.`);
      }

      const existingAttempts = db.attempts.filter(
        (a) => a.examinationId === exam.id && a.studentId === student.id
      );

      const activeAttempt = existingAttempts.find((a) => a.status === 'in_progress');
      if (activeAttempt) {
        if (isAttemptExpired(activeAttempt.deadlineAt)) {
          finalizeAttemptInDb(db, activeAttempt, exam, 'time_expired');
          saveDb(db);
          throw new Error(
            'Your examination time has expired and your script has been automatically submitted.'
          );
        }

        activeAttempt.pageRefreshes++;
        activeAttempt.lastActivityAt = new Date().toISOString();
        const links = db.examinationQuestions.filter((eq) => eq.examinationId === exam.id);
        const sanitizedQuestions = activeAttempt.questionOrder
          .map((qId) => {
            const q = db.questions.find((item) => item.id === qId);
            if (!q) return null;
            const link = links.find((l) => l.questionId === qId);
            return sanitizeQuestionForStudent(q, activeAttempt.optionOrders[qId], link?.marksOverride);
          })
          .filter(Boolean);
        const savedAnswers = db.answers.filter((ans) => ans.attemptId === activeAttempt.id);
        saveDb(db);
        return {
          resumed: true,
          attempt: activeAttempt,
          remainingSeconds: computeRemainingSeconds(activeAttempt.deadlineAt),
          questions: sanitizedQuestions,
          answers: savedAnswers,
        } as T;
      }

      if (existingAttempts.length >= exam.maxAttempts) {
        throw new Error(`Maximum allowed attempts (${exam.maxAttempts}) exhausted for this examination.`);
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
      const deadlineAt = new Date(nowMs + exam.durationMinutes * 60 * 1000).toISOString();

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
          return sanitizeQuestionForStudent(q, optionOrders[qId], link?.marksOverride);
        })
        .filter(Boolean);

      saveDb(db);
      return {
        resumed: false,
        attempt: newAttempt,
        remainingSeconds: computeRemainingSeconds(deadlineAt, nowMs),
        questions: sanitizedQuestions,
        answers: [],
      } as T;
    }

    if (action === 'save_answer' || action === 'heartbeat') {
      const attemptId = String(p.attemptId || '');
      const questionId = String(p.questionId || '');
      const response = p.response as string | string[] | Record<string, string> | null;
      const flaggedForReview = Boolean(p.flaggedForReview);

      if (!attemptId) throw new Error('Attempt ID is required.');
      const student = db.students.find((s) => s.profileId === me.id);
      const attempt = db.attempts.find((a) => a.id === attemptId);
      if (!student || !attempt || attempt.studentId !== student.id) {
        throw new Error('Unauthorized attempt access.');
      }
      const exam = db.examinations.find((e) => e.id === attempt.examinationId);
      if (!exam) throw new Error('Examination record missing.');
      if (attempt.status !== 'in_progress') {
        throw new Error('This examination attempt is already locked.');
      }
      if (isAttemptExpired(attempt.deadlineAt)) {
        finalizeAttemptInDb(db, attempt, exam, 'time_expired');
        saveDb(db);
        throw new Error('Official examination deadline reached. Script auto-submitted.');
      }

      const nowIso = new Date().toISOString();
      attempt.lastActivityAt = nowIso;

      if (action === 'save_answer' && questionId) {
        if (!attempt.questionOrder.includes(questionId)) {
          throw new Error('Question does not belong to this attempt.');
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

      saveDb(db);
      return {
        savedAt: nowIso,
        remainingSeconds: computeRemainingSeconds(attempt.deadlineAt),
      } as T;
    }

    if (action === 'submit_exam') {
      const attemptId = String(p.attemptId || '');
      const reason = p.reason === 'time_expired' ? 'time_expired' : 'submitted';
      const student = db.students.find((s) => s.profileId === me.id);
      const attempt = db.attempts.find((a) => a.id === attemptId);
      if (!student || !attempt || attempt.studentId !== student.id) {
        throw new Error('Unauthorized attempt submission.');
      }
      const exam = db.examinations.find((e) => e.id === attempt.examinationId);
      if (!exam) throw new Error('Examination not found.');

      if (attempt.status !== 'in_progress') {
        const existingResult = db.results.find((r) => r.attemptId === attempt.id);
        return {
          alreadySubmitted: true,
          attempt,
          resultPublished: existingResult?.status === 'published',
          result: existingResult?.status === 'published' ? existingResult : null,
        } as T;
      }

      const effectiveStatus = isAttemptExpired(attempt.deadlineAt) ? 'time_expired' : reason;
      finalizeAttemptInDb(db, attempt, exam, effectiveStatus);
      appendAuditLog(
        db,
        me,
        'EXAM_SUBMITTED',
        'examination_attempt',
        attempt.id,
        `Submitted "${exam.title}" (${effectiveStatus}).`
      );
      saveDb(db);
      const result = db.results.find((r) => r.attemptId === attempt.id);
      return {
        alreadySubmitted: false,
        attempt,
        resultPublished: result?.status === 'published',
        result: result?.status === 'published' ? result : null,
      } as T;
    }

    throw new Error('Unsupported CBT action.');
  }

  if (cleanPath === '/api/results') {
    if (!['super_admin', 'exam_officer', 'teacher', 'hod'].includes(me.role)) {
      throw new Error('Insufficient permissions for grading or result operations.');
    }
    const action = String(body.action || '');
    const p = (body.payload as Record<string, unknown>) || {};

    if (action === 'grade_essay') {
      const answerId = String(p.answerId || '');
      const marksAwarded = Number(p.marksAwarded ?? 0);
      const teacherFeedback = String(p.teacherFeedback || '').trim();
      const finalize = Boolean(p.finalize);
      if (!answerId || Number.isNaN(marksAwarded) || marksAwarded < 0) {
        throw new Error('Valid answer ID and non-negative marks are required.');
      }

      const ans = db.answers.find((a) => a.id === answerId);
      if (!ans) throw new Error('Student answer not found.');
      const attempt = db.attempts.find((at) => at.id === ans.attemptId);
      const exam = attempt ? db.examinations.find((e) => e.id === attempt.examinationId) : undefined;
      const question = db.questions.find((q) => q.id === ans.questionId);
      const link = exam
        ? db.examinationQuestions.find(
            (eq) => eq.examinationId === exam.id && eq.questionId === ans.questionId
          )
        : undefined;
      const maxMarks = link?.marksOverride ?? question?.marks ?? 10;

      if (marksAwarded > maxMarks) {
        throw new Error(`Awarded marks (${marksAwarded}) cannot exceed question maximum (${maxMarks}).`);
      }

      if (me.role === 'teacher' && exam && !exam.assignedTeacherProfileIds.includes(me.id)) {
        const staff = db.staff.find((s) => s.profileId === me.id);
        const hasSub = staff
          ? db.teacherAssignments.some(
              (ta) => ta.staffId === staff.id && ta.subjectId === exam.subjectId
            )
          : false;
        if (!hasSub) throw new Error('You may only mark scripts for your assigned subjects.');
      }

      const now = new Date().toISOString();
      ans.marksAwarded = roundScore(marksAwarded);
      ans.teacherFeedback = teacherFeedback;
      if (finalize) ans.markedByProfileId = me.id;
      ans.updatedAt = now;

      if (attempt && exam) {
        const allAttemptAnswers = db.answers.filter((a) => a.attemptId === attempt.id);
        const totals = calculateResultTotals(
          allAttemptAnswers,
          exam.totalMarks,
          exam.passMarkPercent,
          db.settings.gradingScale
        );
        if (totals.manualGradingCompleted) attempt.status = 'graded';
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
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'update_result_status') {
      if (!['super_admin', 'exam_officer'].includes(me.role)) {
        throw new Error('Only Examination Officers or Super Admins can approve or publish results.');
      }
      const resultIds = (p.resultIds as string[]) || (p.resultId ? [String(p.resultId)] : []);
      const nextStatus = String(p.status || '') as
        | 'approved'
        | 'published'
        | 'withheld'
        | 'pending_review';
      const reason = String(p.reason || '').trim();
      if (
        resultIds.length === 0 ||
        !['approved', 'published', 'withheld', 'pending_review'].includes(nextStatus)
      ) {
        throw new Error('Result IDs and valid target status are required.');
      }

      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const rId of resultIds) {
        const r = db.results.find((item) => item.id === rId);
        if (!r) continue;
        if (nextStatus === 'published' && !r.manualGradingCompleted) {
          throw new Error('Cannot publish a result while essay/subjective questions remain ungraded.');
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
      saveDb(db);
      return { ok: true, updatedCount } as T;
    }

    if (action === 'correct_result_score') {
      if (me.role !== 'super_admin') {
        throw new Error('Only Super Administrator may adjust a finalized result score.');
      }
      const resultId = String(p.resultId || '');
      const newTotalScore = Number(p.totalScore);
      const correctionReason = String(p.correctionReason || '').trim();
      if (!resultId || Number.isNaN(newTotalScore) || newTotalScore < 0 || !correctionReason) {
        throw new Error('Result ID, valid score, and an audit reason are required.');
      }
      const r = db.results.find((item) => item.id === resultId);
      if (!r) throw new Error('Result record not found.');
      if (newTotalScore > r.totalPossibleMarks) {
        throw new Error(`Adjusted score cannot exceed ${r.totalPossibleMarks}.`);
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
      saveDb(db);
      return { ok: true } as T;
    }

    throw new Error('Invalid results action.');
  }

  if (cleanPath === '/api/admin/manage') {
    const action = String(body.action || '');
    const p = (body.payload as Record<string, unknown>) || {};

    if (action === 'mark_notification_read') {
      const id = String(p.id || '');
      for (const n of db.notifications) {
        if (n.recipientProfileId === me.id && (!id || n.id === id)) {
          n.isRead = true;
        }
      }
      saveDb(db);
      return { ok: true } as T;
    }

    const isAdmin = me.role === 'super_admin';
    const isExamOfficer = me.role === 'exam_officer';
    if (!isAdmin && !isExamOfficer) {
      throw new Error('Administrative privileges required.');
    }

    if (action === 'create_student' || action === 'bulk_import_students') {
      if (!isAdmin) throw new Error('Only Super Admin can provision student accounts.');
      const items =
        action === 'bulk_import_students'
          ? (p.students as Array<Record<string, string>>) || []
          : [p as Record<string, string>];
      if (items.length === 0) throw new Error('No student records provided.');

      const created: string[] = [];
      const skipped: Array<{ admissionNumber: string; reason: string }> = [];
      const now = new Date().toISOString();

      for (const item of items) {
        const fullName = String(item.fullName || '').trim();
        const email = String(item.email || '').trim().toLowerCase();
        const admissionNumber = String(item.admissionNumber || '').trim().toUpperCase();
        const classId = String(item.classId || '').trim();
        const password = String(item.password || '');

        if (!fullName || !email || !admissionNumber || !classId || password.length < 8) {
          skipped.push({
            admissionNumber: admissionNumber || 'UNKNOWN',
            reason: 'Missing required fields or password shorter than 8 characters.',
          });
          continue;
        }
        if (
          db.profiles.some((pr) => pr.email.toLowerCase() === email) ||
          db.students.some((st) => st.admissionNumber.toUpperCase() === admissionNumber)
        ) {
          skipped.push({ admissionNumber, reason: 'Duplicate email or admission number.' });
          continue;
        }
        const cls = db.classes.find((c) => c.id === classId);
        if (!cls) {
          skipped.push({ admissionNumber, reason: 'Invalid class ID.' });
          continue;
        }

        const profileId = newId('prof_stu');
        const studentId = newId('stu');
        db.profiles.push({
          id: profileId,
          email,
          fullName,
          role: 'student',
          isActive: true,
          passwordHash: hashPassword(password),
          createdAt: now,
          updatedAt: now,
        });
        db.students.push({
          id: studentId,
          profileId,
          admissionNumber,
          classId,
          departmentId: String(item.departmentId || cls.departmentId || ''),
          gender: item.gender === 'Female' ? 'Female' : 'Male',
          guardianName: item.guardianName,
          guardianPhone: item.guardianPhone,
          accountStatus: 'active',
          isSampleData: false,
          createdAt: now,
        });

        const currSess = db.sessions.find((s) => s.isCurrent);
        const currTerm = db.terms.find((t) => t.isCurrent);
        if (currSess && currTerm) {
          db.enrollments.push({
            id: newId('enr'),
            studentId,
            sessionId: currSess.id,
            termId: currTerm.id,
            classId,
            subjectIds: db.subjects
              .filter((sub) => sub.applicableClassIds.includes(classId))
              .map((sub) => sub.id),
            status: 'enrolled',
            createdAt: now,
          });
        }
        created.push(admissionNumber);
      }

      appendAuditLog(
        db,
        me,
        'STUDENTS_PROVISIONED',
        'student',
        created.join(','),
        `Created ${created.length} student(s); skipped ${skipped.length}.`
      );
      saveDb(db);
      return { created, skipped } as T;
    }

    if (action === 'update_student_status' || action === 'promote_transfer_student') {
      if (!isAdmin) throw new Error('Forbidden.');
      const studentId = String(p.studentId || '');
      const stu = db.students.find((s) => s.id === studentId);
      if (!stu) throw new Error('Student not found.');
      const prof = db.profiles.find((pr) => pr.id === stu.profileId);

      if (action === 'update_student_status') {
        const nextStatus = p.accountStatus as 'active' | 'pending_activation' | 'withdrawn' | 'graduated';
        stu.accountStatus = nextStatus;
        if (prof) {
          prof.isActive = nextStatus === 'active';
          prof.updatedAt = new Date().toISOString();
        }
        if (nextStatus === 'active' && prof) {
          db.notifications.unshift({
            id: newId('notif'),
            recipientProfileId: prof.id,
            title: 'Student Account Activated',
            message: `Your JUNEBERRIES INTERNATIONAL SCHOOLS CBT account (${stu.admissionNumber}) is now active.`,
            category: 'account',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
        appendAuditLog(db, me, 'STUDENT_STATUS_UPDATED', 'student', stu.id, `Updated status to ${nextStatus}.`);
      } else {
        const targetClassId = String(p.classId || '');
        const targetCls = db.classes.find((c) => c.id === targetClassId);
        if (!targetCls) throw new Error('Target class not found.');
        const oldClassId = stu.classId;
        stu.classId = targetClassId;
        if (p.departmentId) stu.departmentId = String(p.departmentId);
        appendAuditLog(
          db,
          me,
          'STUDENT_CLASS_CHANGED',
          'student',
          stu.id,
          `Moved ${stu.admissionNumber} from ${oldClassId} to ${targetClassId}.`
        );
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'create_staff') {
      if (!isAdmin) throw new Error('Forbidden.');
      const fullName = String(p.fullName || '').trim();
      const email = String(p.email || '').trim().toLowerCase();
      const role = String(p.role || 'teacher') as UserRole;
      const staffNumber = String(p.staffNumber || '').trim().toUpperCase();
      const designation = String(p.designation || '').trim();
      const departmentId = p.departmentId ? String(p.departmentId) : undefined;
      const password = String(p.password || '');
      const initialAssignments = Array.isArray(p.assignments)
        ? (p.assignments as ClassSubjectSelection[])
        : [];

      if (!fullName || !email || !staffNumber || !designation || password.length < 8) {
        throw new Error('Full name, email, staff number, designation, and password (min 8 chars) are required.');
      }
      if (role === 'student') throw new Error('Use student provisioning for student accounts.');
      if (
        db.profiles.some((pr) => pr.email.toLowerCase() === email) ||
        db.staff.some((st) => st.staffNumber.toUpperCase() === staffNumber)
      ) {
        throw new Error('Email or staff number already exists.');
      }

      const now = new Date().toISOString();
      const profileId = newId('prof_stf');
      const staffId = newId('staff');
      const currentSessionId =
        db.sessions.find((s) => s.isCurrent)?.id || db.sessions[0]?.id || 'sess_2026_2027';

      db.profiles.push({
        id: profileId,
        email,
        fullName,
        role,
        isActive: true,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      });
      db.staff.push({
        id: staffId,
        profileId,
        staffNumber,
        departmentId,
        designation,
        isSampleData: false,
        createdAt: now,
      });

      if (initialAssignments.length > 0) {
        const checked = validateStaffAssignments(initialAssignments, db.classes, db.subjects);
        for (const pair of checked.valid) {
          db.teacherAssignments.push({
            id: newId('ta'),
            staffId,
            classId: pair.classId,
            subjectId: pair.subjectId,
            sessionId: currentSessionId,
            createdAt: now,
          });
        }
      }

      appendAuditLog(db, me, 'STAFF_CREATED', 'staff', staffId, `Provisioned ${role} ${fullName} (${staffNumber}).`);
      saveDb(db);
      return { ok: true, staffId } as T;
    }

    if (action === 'update_staff_role' || action === 'update_staff_status') {
      if (!isAdmin) throw new Error('Forbidden.');
      const profileId = String(p.profileId || '');
      const role = p.role ? (String(p.role) as UserRole) : undefined;
      const isActive = typeof p.isActive === 'boolean' ? p.isActive : undefined;

      const prof = db.profiles.find((pr) => pr.id === profileId && pr.role !== 'student');
      if (!prof) throw new Error('Staff profile not found.');
      const operation = isActive === false ? 'deactivate' : 'change_role';

      if (isActive === false || (role && role !== prof.role)) {
        const guard = checkStaffAccountMutationGuard({
          actorProfileId: me.id,
          targetProfile: prof,
          allProfiles: db.profiles,
          operation,
          nextRole: role,
        });
        if (!guard.allowed) throw new Error(guard.error || 'Operation prohibited.');
      }

      if (role && role !== 'student') prof.role = role;
      if (isActive !== undefined) prof.isActive = isActive;
      prof.updatedAt = new Date().toISOString();

      appendAuditLog(
        db,
        me,
        action === 'update_staff_status' ? 'STAFF_STATUS_UPDATED' : 'STAFF_PERMISSIONS_UPDATED',
        'profile',
        prof.id,
        `Updated ${prof.fullName} (${prof.email}) role=${prof.role}, active=${prof.isActive}`
      );
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'delete_staff') {
      if (!isAdmin) throw new Error('Forbidden.');
      const staffId = String(p.staffId || '');
      const profileId = String(p.profileId || '');
      if (!staffId && !profileId) throw new Error('Staff ID or Profile ID is required.');

      const staffRec = db.staff.find(
        (st) => (staffId && st.id === staffId) || (profileId && st.profileId === profileId)
      );
      const targetProfileId = staffRec?.profileId || profileId;
      const prof = db.profiles.find((pr) => pr.id === targetProfileId && pr.role !== 'student');
      if (!prof) throw new Error('Staff account not found.');

      const guard = checkStaffAccountMutationGuard({
        actorProfileId: me.id,
        targetProfile: prof,
        allProfiles: db.profiles,
        operation: 'delete',
      });
      if (!guard.allowed) throw new Error(guard.error || 'Cannot delete this staff account.');

      const deletedName = prof.fullName;
      const deletedEmail = prof.email;
      const deletedStaffNo = staffRec?.staffNumber || prof.id;

      if (staffRec) {
        for (const dept of db.departments) {
          if (dept.hodStaffId === staffRec.id) dept.hodStaffId = undefined;
        }
        db.teacherAssignments = db.teacherAssignments.filter((ta) => ta.staffId !== staffRec.id);
        db.staff = db.staff.filter((st) => st.id !== staffRec.id);
      }

      db.notifications = db.notifications.filter((n) => n.recipientProfileId !== prof.id);
      db.passwordResetTokens = db.passwordResetTokens.filter((t) => t.profileId !== prof.id);
      db.profiles = db.profiles.filter((pr) => pr.id !== prof.id);

      appendAuditLog(
        db,
        me,
        'STAFF_DELETED',
        'staff',
        staffRec?.id || prof.id,
        `Permanently deleted staff member ${deletedName} (${deletedStaffNo} · ${deletedEmail}) and revoked login credentials.`
      );
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'assign_teacher') {
      const staffId = String(p.staffId || '');
      const classId = String(p.classId || '');
      const subjectId = String(p.subjectId || '');
      if (!staffId || !classId || !subjectId) throw new Error('Staff, class, and subject are required.');
      const currSess = db.sessions.find((s) => s.isCurrent);
      const sessionId = currSess?.id || 'sess_2026_2027';
      const exists = db.teacherAssignments.some(
        (ta) => ta.staffId === staffId && ta.classId === classId && ta.subjectId === subjectId && ta.sessionId === sessionId
      );
      if (!exists) {
        db.teacherAssignments.push({
          id: newId('ta'),
          staffId,
          classId,
          subjectId,
          sessionId,
          createdAt: new Date().toISOString(),
        });
        appendAuditLog(db, me, 'TEACHER_ASSIGNED', 'teacher_assignment', staffId, `Assigned class ${classId} / subject ${subjectId}.`);
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'remove_teacher_assignment') {
      if (!isAdmin) throw new Error('Forbidden.');
      const assignmentId = String(p.assignmentId || '');
      if (!assignmentId) throw new Error('Assignment ID is required.');
      const idx = db.teacherAssignments.findIndex((ta) => ta.id === assignmentId);
      if (idx !== -1) {
        const removed = db.teacherAssignments[idx];
        db.teacherAssignments.splice(idx, 1);
        appendAuditLog(
          db,
          me,
          'TEACHER_ASSIGNMENT_REMOVED',
          'teacher_assignment',
          assignmentId,
          `Removed assignment for staff ${removed.staffId} (${removed.classId} / ${removed.subjectId}).`
        );
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'create_department') {
      if (!isAdmin) throw new Error('Forbidden.');
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const description = String(p.description || '').trim();
      if (!name || !code) throw new Error('Department name and code are required.');
      db.departments.push({
        id: newId('dept'),
        name,
        code,
        description,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      appendAuditLog(db, me, 'DEPARTMENT_CREATED', 'department', code, `Created department ${name}.`);
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'create_class') {
      if (!isAdmin) throw new Error('Forbidden.');
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const levelGroup = String(p.levelGroup || 'senior_secondary') as 'primary' | 'junior_secondary' | 'senior_secondary';
      if (!name || !code) throw new Error('Class name and code are required.');
      db.classes.push({
        id: newId('cls'),
        name,
        code,
        levelGroup,
        levelOrder: db.classes.length + 1,
        departmentId: p.departmentId ? String(p.departmentId) : undefined,
        capacity: Number(p.capacity || 40),
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      appendAuditLog(db, me, 'CLASS_CREATED', 'class', code, `Created class ${name}.`);
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'create_subject') {
      if (!isAdmin) throw new Error('Forbidden.');
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const departmentId = String(p.departmentId || '');
      const levelGroup = String(p.levelGroup || 'senior_secondary') as 'primary' | 'junior_secondary' | 'senior_secondary';
      const applicableClassIds = (p.applicableClassIds as string[]) || [];
      if (!name || !code || !departmentId) throw new Error('Subject name, code, and department are required.');
      db.subjects.push({
        id: newId('sub'),
        name,
        code,
        departmentId,
        levelGroup,
        applicableClassIds,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      appendAuditLog(db, me, 'SUBJECT_CREATED', 'subject', code, `Created subject ${name} (${code}).`);
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'create_session' || action === 'set_current_session_term') {
      if (!isAdmin) throw new Error('Forbidden.');
      if (action === 'create_session') {
        const name = String(p.name || '').trim();
        const startDate = String(p.startDate || '');
        const endDate = String(p.endDate || '');
        if (!name || !startDate || !endDate) {
          throw new Error('Session name, start date, and end date are required.');
        }
        const sessId = newId('sess');
        const now = new Date().toISOString();
        db.sessions.push({ id: sessId, name, startDate, endDate, isCurrent: false, createdAt: now });
        db.terms.push(
          { id: newId('term'), sessionId: sessId, name: 'First Term', startDate, endDate, isCurrent: false, createdAt: now },
          { id: newId('term'), sessionId: sessId, name: 'Second Term', startDate, endDate, isCurrent: false, createdAt: now },
          { id: newId('term'), sessionId: sessId, name: 'Third Term', startDate, endDate, isCurrent: false, createdAt: now }
        );
        appendAuditLog(db, me, 'SESSION_CREATED', 'academic_session', sessId, `Created ${name} with 3 terms.`);
      } else {
        const sessionId = String(p.sessionId || '');
        const termId = String(p.termId || '');
        if (sessionId) {
          for (const s of db.sessions) s.isCurrent = s.id === sessionId;
        }
        if (termId) {
          for (const t of db.terms) t.isCurrent = t.id === termId;
        }
        appendAuditLog(db, me, 'ACTIVE_PERIOD_CHANGED', 'academic_term', termId || sessionId, 'Updated active academic session/term.');
      }
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'update_settings') {
      if (!isAdmin) throw new Error('Forbidden.');
      if (typeof p.schoolName === 'string' && p.schoolName.trim()) db.settings.schoolName = p.schoolName.trim();
      if (typeof p.motto === 'string') db.settings.motto = p.motto.trim();
      if (typeof p.address === 'string') db.settings.address = p.address.trim();
      if (typeof p.email === 'string') db.settings.email = p.email.trim();
      if (typeof p.phone === 'string') db.settings.phone = p.phone.trim();
      if (typeof p.logoUrl === 'string' && isValidSafeUrl(p.logoUrl)) db.settings.logoUrl = p.logoUrl;
      if (typeof p.defaultInstructions === 'string') db.settings.defaultInstructions = p.defaultInstructions;
      if (typeof p.allowPartialMultipleSelect === 'boolean') db.settings.allowPartialMultipleSelect = p.allowPartialMultipleSelect;
      if (typeof p.enableNegativeMarkingDefault === 'boolean') db.settings.enableNegativeMarkingDefault = p.enableNegativeMarkingDefault;
      if (typeof p.allowStudentSelfRegistration === 'boolean') db.settings.allowStudentSelfRegistration = p.allowStudentSelfRegistration;
      if (typeof p.requireAdminApprovalForStudents === 'boolean') db.settings.requireAdminApprovalForStudents = p.requireAdminApprovalForStudents;
      if (typeof p.allowUnapprovedQuestionsByAdmin === 'boolean') db.settings.allowUnapprovedQuestionsByAdmin = p.allowUnapprovedQuestionsByAdmin;
      if (Array.isArray(p.gradingScale)) db.settings.gradingScale = p.gradingScale as GradeBand[];
      db.settings.updatedAt = new Date().toISOString();
      appendAuditLog(db, me, 'SETTINGS_UPDATED', 'school_settings', 'settings_default', 'Updated school branding, grading scale, or exam policies.');
      saveDb(db);
      return { ok: true } as T;
    }

    if (action === 'broadcast_announcement') {
      const title = String(p.title || '').trim();
      const message = String(p.message || '').trim();
      const targetRole = String(p.targetRole || 'all');
      if (!title || !message) throw new Error('Announcement title and message are required.');
      const now = new Date().toISOString();
      for (const prof of db.profiles) {
        if (prof.isActive && (targetRole === 'all' || prof.role === targetRole)) {
          db.notifications.unshift({
            id: newId('notif'),
            recipientProfileId: prof.id,
            title,
            message,
            category: 'announcement',
            isRead: false,
            createdAt: now,
          });
        }
      }
      appendAuditLog(db, me, 'ANNOUNCEMENT_BROADCAST', 'notification', targetRole, title);
      saveDb(db);
      return { ok: true } as T;
    }

    throw new Error(`Unsupported admin action: ${action}`);
  }

  throw new Error(`Unknown endpoint: ${cleanPath}`);
}
