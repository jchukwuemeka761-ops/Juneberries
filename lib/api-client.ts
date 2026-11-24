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

let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null) {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (inMemoryToken) {
    headers.set('Authorization', `Bearer ${inMemoryToken}`);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
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
  sampleEnabled: boolean;
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
