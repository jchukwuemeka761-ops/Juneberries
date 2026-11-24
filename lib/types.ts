export type UserRole =
  | 'super_admin'
  | 'exam_officer'
  | 'principal'
  | 'hod'
  | 'teacher'
  | 'invigilator'
  | 'student';

export type AcademicLevelGroup = 'primary' | 'junior_secondary' | 'senior_secondary';

export type QuestionType =
  | 'mcq'
  | 'true_false'
  | 'multiple_select'
  | 'fill_in_gap'
  | 'short_answer'
  | 'essay'
  | 'matching'
  | 'image_based';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export type QuestionApprovalStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'archived';

export type ExaminationType =
  | 'weekly_test'
  | 'class_quiz'
  | 'continuous_assessment'
  | 'mid_term'
  | 'terminal'
  | 'mock'
  | 'practice'
  | 'promotional';

export type ExaminationStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'closed'
  | 'rescheduled'
  | 'archived';

export type AttemptStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'time_expired'
  | 'graded';

export type ResultStatus = 'pending_review' | 'approved' | 'published' | 'withheld';

export interface GradeBand {
  grade: string;
  minScore: number;
  maxScore: number;
  remark: string;
}

export interface SchoolSettings {
  id: string;
  schoolName: string;
  motto: string;
  address: string;
  email: string;
  phone: string;
  logoUrl: string;
  primaryColor: string;
  accentColor: string;
  defaultInstructions: string;
  gradingScale: GradeBand[];
  allowPartialMultipleSelect: boolean;
  enableNegativeMarkingDefault: boolean;
  autoSubmitOnTabLimit: number;
  allowStudentSelfRegistration: boolean;
  requireAdminApprovalForStudents: boolean;
  allowUnapprovedQuestionsByAdmin: boolean;
  updatedAt: string;
}

export interface Profile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
  isActive: boolean;
  passwordHash: string;
  mustChangePassword?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PublicProfile = Omit<Profile, 'passwordHash'>;

export interface Department {
  id: string;
  name: string;
  code: string;
  description: string;
  hodStaffId?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AcademicClass {
  id: string;
  name: string;
  code: string;
  levelGroup: AcademicLevelGroup;
  levelOrder: number;
  departmentId?: string;
  capacity: number;
  isActive: boolean;
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  levelGroup: AcademicLevelGroup;
  applicableClassIds: string[];
  isActive: boolean;
  createdAt: string;
}

export interface AcademicSession {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface AcademicTerm {
  id: string;
  sessionId: string;
  name: 'First Term' | 'Second Term' | 'Third Term';
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface StudentRecord {
  id: string;
  profileId: string;
  admissionNumber: string;
  classId: string;
  departmentId?: string;
  gender: 'Male' | 'Female';
  dateOfBirth?: string;
  guardianName?: string;
  guardianPhone?: string;
  accountStatus: 'pending_activation' | 'active' | 'withdrawn' | 'graduated';
  isSampleData: boolean;
  createdAt: string;
}

export interface StaffRecord {
  id: string;
  profileId: string;
  staffNumber: string;
  departmentId?: string;
  designation: string;
  isSampleData: boolean;
  createdAt: string;
}

export interface StudentEnrollment {
  id: string;
  studentId: string;
  sessionId: string;
  termId: string;
  classId: string;
  subjectIds: string[];
  status: 'enrolled' | 'promoted' | 'transferred' | 'withdrawn';
  createdAt: string;
}

export interface TeacherAssignment {
  id: string;
  staffId: string;
  classId: string;
  subjectId: string;
  sessionId: string;
  createdAt: string;
}

export interface QuestionBank {
  id: string;
  title: string;
  subjectId: string;
  classId: string;
  departmentId: string;
  createdByProfileId: string;
  createdAt: string;
}

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
}

export interface MatchingPair {
  id: string;
  left: string;
  right: string;
}

export interface QuestionAttachment {
  id: string;
  questionId: string;
  fileName: string;
  mimeType: string;
  url: string;
  sizeBytes: number;
  createdAt: string;
}

export interface Question {
  id: string;
  bankId?: string;
  subjectId: string;
  classId: string;
  topic: string;
  subtopic?: string;
  difficulty: DifficultyLevel;
  marks: number;
  questionType: QuestionType;
  questionText: string;
  options: QuestionOption[];
  matchingPairs?: MatchingPair[];
  correctAnswer: string | string[] | Record<string, string>;
  acceptedAnswers?: string[];
  explanation?: string;
  markingGuide?: string;
  imageUrl?: string;
  teacherProfileId: string;
  approvalStatus: QuestionApprovalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SanitizedQuestion {
  id: string;
  subjectId: string;
  classId: string;
  topic: string;
  subtopic?: string;
  difficulty: DifficultyLevel;
  marks: number;
  questionType: QuestionType;
  questionText: string;
  options: QuestionOption[];
  matchingLeftItems?: string[];
  matchingRightItems?: string[];
  imageUrl?: string;
}

export interface QuestionApproval {
  id: string;
  questionId: string;
  reviewerProfileId: string;
  action: QuestionApprovalStatus;
  comment?: string;
  createdAt: string;
}

export interface Examination {
  id: string;
  title: string;
  sessionId: string;
  termId: string;
  classId: string;
  subjectId: string;
  examType: ExaminationType;
  examDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  totalMarks: number;
  questionCount: number;
  passMarkPercent: number;
  maxAttempts: number;
  instructions: string;
  assignedStudentIds: string[];
  assignedTeacherProfileIds: string[];
  assignedInvigilatorProfileIds: string[];
  randomiseQuestions: boolean;
  randomiseOptions: boolean;
  restrictNavigation: boolean;
  enableNegativeMarking: boolean;
  negativeMarkPenalty: number;
  autoPublishObjectiveResults: boolean;
  status: ExaminationStatus;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExaminationQuestion {
  id: string;
  examinationId: string;
  questionId: string;
  orderIndex: number;
  marksOverride?: number;
}

export interface ExaminationAssignment {
  id: string;
  examinationId: string;
  studentId: string;
  eligible: boolean;
  createdAt: string;
}

export interface ExaminationAttempt {
  id: string;
  examinationId: string;
  studentId: string;
  attemptNumber: number;
  status: AttemptStatus;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  startedAt: string;
  deadlineAt: string;
  lastActivityAt: string;
  submittedAt?: string;
  connectionInterruptions: number;
  tabVisibilityChanges: number;
  focusLosses: number;
  pageRefreshes: number;
  isDisconnected?: boolean;
  createdAt: string;
}

export interface StudentAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  response: string | string[] | Record<string, string> | null;
  flaggedForReview: boolean;
  isObjectiveMarked: boolean;
  requiresManualMarking: boolean;
  marksAwarded: number;
  teacherFeedback?: string;
  markedByProfileId?: string;
  updatedAt: string;
}

export interface ExaminationResult {
  id: string;
  attemptId: string;
  examinationId: string;
  studentId: string;
  sessionId: string;
  termId: string;
  classId: string;
  subjectId: string;
  objectiveScore: number;
  subjectiveScore: number;
  totalScore: number;
  totalPossibleMarks: number;
  percentage: number;
  grade: string;
  remark: string;
  passed: boolean;
  status: ResultStatus;
  manualGradingCompleted: boolean;
  correctionReason?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResultApproval {
  id: string;
  resultId: string;
  reviewerProfileId: string;
  action: ResultStatus;
  reason?: string;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  recipientProfileId: string;
  title: string;
  message: string;
  category: 'exam' | 'question' | 'result' | 'account' | 'announcement';
  isRead: boolean;
  linkView?: string;
  createdAt: string;
}

export interface ExaminationIncident {
  id: string;
  examinationId: string;
  attemptId?: string;
  studentId?: string;
  reportedByProfileId: string;
  eventType:
    | 'tab_switch'
    | 'focus_loss'
    | 'page_refresh'
    | 'network_drop'
    | 'invigilator_report'
    | 'auto_submit_warning';
  severity: 'info' | 'warning' | 'critical';
  description: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorProfileId: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  entityType: string;
  entityId: string;
  details: string;
  createdAt: string;
}

export interface PasswordResetToken {
  id: string;
  profileId: string;
  token: string;
  expiresAt: string;
  used: boolean;
}

export interface SchoolDatabase {
  initialized: boolean;
  settings: SchoolSettings;
  profiles: Profile[];
  students: StudentRecord[];
  staff: StaffRecord[];
  departments: Department[];
  classes: AcademicClass[];
  subjects: Subject[];
  sessions: AcademicSession[];
  terms: AcademicTerm[];
  enrollments: StudentEnrollment[];
  teacherAssignments: TeacherAssignment[];
  questionBanks: QuestionBank[];
  questions: Question[];
  attachments: QuestionAttachment[];
  questionApprovals: QuestionApproval[];
  examinations: Examination[];
  examinationQuestions: ExaminationQuestion[];
  examinationAssignments: ExaminationAssignment[];
  attempts: ExaminationAttempt[];
  answers: StudentAnswer[];
  results: ExaminationResult[];
  resultApprovals: ResultApproval[];
  notifications: NotificationItem[];
  incidents: ExaminationIncident[];
  auditLogs: AuditLog[];
  passwordResetTokens: PasswordResetToken[];
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  exam_officer: 'Examination Officer',
  principal: 'Principal / Management',
  hod: 'Head of Department',
  teacher: 'Subject Teacher',
  invigilator: 'Invigilator',
  student: 'Student',
};

export const EXAM_TYPE_LABELS: Record<ExaminationType, string> = {
  weekly_test: 'Weekly Test',
  class_quiz: 'Class Quiz',
  continuous_assessment: 'Continuous Assessment',
  mid_term: 'Mid-Term Examination',
  terminal: 'Terminal Examination',
  mock: 'Mock Examination',
  practice: 'Practice Examination',
  promotional: 'Promotional Examination',
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: 'Multiple Choice',
  true_false: 'True / False',
  multiple_select: 'Multiple Select',
  fill_in_gap: 'Fill in the Gap',
  short_answer: 'Short Answer',
  essay: 'Essay / Theory',
  matching: 'Matching Pairs',
  image_based: 'Image-Based Question',
};
