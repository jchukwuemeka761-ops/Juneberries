import type {
  AcademicClass,
  AcademicSession,
  AcademicTerm,
  AuditLog,
  Department,
  Examination,
  ExaminationAttempt,
  ExaminationIncident,
  ExaminationQuestion,
  ExaminationResult,
  NotificationItem,
  PublicProfile,
  Question,
  QuestionApproval,
  QuestionBank,
  SanitizedQuestion,
  SchoolSettings,
  StaffRecord,
  StudentAnswer,
  StudentEnrollment,
  StudentRecord,
  Subject,
  TeacherAssignment,
} from './types';
import {
  buildHealthPayload,
  dispatchLocalApi,
  getStoredSessionToken,
  setStoredSessionToken,
} from './local-backend';

export function setAuthToken(token: string | null) {
  setStoredSessionToken(token);
}

export function getAuthToken(): string | null {
  return getStoredSessionToken();
}

export function getHealthSnapshot(): HealthInfo {
  return buildHealthPayload(getStoredSessionToken());
}

export function getBootstrapSnapshot(): PortalBootstrapData | null {
  const token = getStoredSessionToken();
  if (!token) return null;
  try {
    return dispatchLocalApi<PortalBootstrapData>('/api/portal/bootstrap', {}, token);
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return dispatchLocalApi<T>(path, options, getStoredSessionToken());
}

export interface HealthInfo {
  initialized: boolean;
  authenticated: boolean;
  requiresBootstrapPasscode: boolean;
  schoolName: string;
  motto: string;
  address: string;
  email: string;
  phone: string;
  logoUrl: string;
  allowStudentSelfRegistration: boolean;
  requireAdminApprovalForStudents: boolean;
  classes: Array<{ id: string; name: string; code: string; levelGroup: string }>;
  departments: Array<{ id: string; name: string; code: string }>;
  subjects: Array<{
    id: string;
    name: string;
    code: string;
    departmentId: string;
    levelGroup: string;
    applicableClassIds: string[];
  }>;
  sessions: AcademicSession[];
  terms: AcademicTerm[];
  sampleEnabled: boolean;
}

export interface ResultCheckResponse {
  studentName: string;
  admissionNumber: string;
  className: string;
  schoolName: string;
  results: Array<{
    id: string;
    examTitle: string;
    subjectName: string;
    sessionId: string;
    sessionName: string;
    termId: string;
    termName: string;
    className: string;
    objectiveScore: number;
    subjectiveScore: number;
    totalScore: number;
    totalPossibleMarks: number;
    percentage: number;
    grade: string;
    remark: string;
    passed: boolean;
    publishedAt?: string;
  }>;
}

export interface PortalBootstrapData {
  me: PublicProfile;
  settings: SchoolSettings;
  departments: Department[];
  classes: AcademicClass[];
  subjects: Subject[];
  sessions: AcademicSession[];
  terms: AcademicTerm[];
  notifications: NotificationItem[];
  studentRecord?: StudentRecord | null;
  staffRecord?: StaffRecord | null;
  studentClassReadiness?: Array<{
    subjectId: string;
    subjectName: string;
    subjectCode: string;
    approvedQuestionCount: number;
    activeExamCount: number;
    scheduledExamCount: number;
  }>;
  profiles?: PublicProfile[];
  staffProfiles?: PublicProfile[];
  students?: StudentRecord[];
  staff?: StaffRecord[];
  enrollments?: StudentEnrollment[];
  teacherAssignments?: TeacherAssignment[];
  questionBanks?: QuestionBank[];
  questions?: Question[];
  questionApprovals?: QuestionApproval[];
  examinations?: Examination[];
  examinationQuestions?: ExaminationQuestion[];
  attempts?: Array<ExaminationAttempt & { remainingSeconds?: number }>;
  answers?: StudentAnswer[];
  results?: ExaminationResult[];
  incidents?: ExaminationIncident[];
  auditLogs?: AuditLog[];
}

export interface StartExamResponse {
  resumed: boolean;
  attempt: ExaminationAttempt;
  remainingSeconds: number;
  questions: SanitizedQuestion[];
  answers: StudentAnswer[];
}
