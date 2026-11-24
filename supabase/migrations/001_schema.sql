-- Juneberry International Schools CBT Portal — Complete PostgreSQL Schema (26 Core Tables)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM (
  'super_admin', 'exam_officer', 'principal', 'hod', 'teacher', 'invigilator', 'student'
);
CREATE TYPE academic_level_group AS ENUM ('primary', 'junior_secondary', 'senior_secondary');
CREATE TYPE question_type AS ENUM (
  'mcq', 'true_false', 'multiple_select', 'fill_in_gap', 'short_answer', 'essay', 'matching', 'image_based'
);
CREATE TYPE question_approval_status AS ENUM (
  'draft', 'submitted', 'under_review', 'approved', 'rejected', 'archived'
);
CREATE TYPE examination_type AS ENUM (
  'weekly_test', 'class_quiz', 'continuous_assessment', 'mid_term', 'terminal', 'mock', 'practice', 'promotional'
);
CREATE TYPE examination_status AS ENUM (
  'draft', 'scheduled', 'active', 'closed', 'rescheduled', 'archived'
);
CREATE TYPE attempt_status AS ENUM (
  'not_started', 'in_progress', 'submitted', 'time_expired', 'graded'
);
CREATE TYPE result_status AS ENUM (
  'pending_review', 'approved', 'published', 'withheld'
);

-- 1. profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'student',
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  hod_staff_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. classes
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  level_group academic_level_group NOT NULL,
  level_order INTEGER NOT NULL,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  capacity INTEGER NOT NULL DEFAULT 40,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. subjects
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  department_id UUID NOT NULL REFERENCES public.departments(id),
  level_group academic_level_group NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. students
CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  admission_number TEXT UNIQUE NOT NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id),
  department_id UUID REFERENCES public.departments(id),
  gender TEXT CHECK (gender IN ('Male', 'Female')),
  guardian_name TEXT,
  guardian_phone TEXT,
  account_status TEXT NOT NULL DEFAULT 'pending_activation',
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. staff
CREATE TABLE public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_number TEXT UNIQUE NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  designation TEXT NOT NULL,
  is_sample_data BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. academic_sessions
CREATE TABLE public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. academic_terms
CREATE TABLE public.academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN ('First Term', 'Second Term', 'Third Term')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, name)
);

-- 9. student_enrollments
CREATE TABLE public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id),
  term_id UUID NOT NULL REFERENCES public.academic_terms(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  status TEXT NOT NULL DEFAULT 'enrolled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id, term_id)
);

-- 10. teacher_assignments
CREATE TABLE public.teacher_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (staff_id, class_id, subject_id, session_id)
);

-- 11. question_banks
CREATE TABLE public.question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  department_id UUID NOT NULL REFERENCES public.departments(id),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 12. questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_id UUID REFERENCES public.question_banks(id) ON DELETE SET NULL,
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  topic TEXT NOT NULL,
  subtopic TEXT,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  marks NUMERIC(6,2) NOT NULL CHECK (marks > 0),
  question_type question_type NOT NULL,
  question_text TEXT NOT NULL,
  correct_answer JSONB NOT NULL,
  accepted_answers JSONB,
  explanation TEXT,
  marking_guide TEXT,
  image_url TEXT,
  teacher_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  approval_status question_approval_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 13. question_options
CREATE TABLE public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_key TEXT NOT NULL,
  label TEXT NOT NULL,
  option_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

-- 14. question_attachments
CREATE TABLE public.question_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. question_approvals
CREATE TABLE public.question_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reviewer_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  action question_approval_status NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 16. examinations
CREATE TABLE public.examinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id),
  term_id UUID NOT NULL REFERENCES public.academic_terms(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  exam_type examination_type NOT NULL,
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  total_marks NUMERIC(8,2) NOT NULL DEFAULT 0,
  question_count INTEGER NOT NULL DEFAULT 0,
  pass_mark_percent NUMERIC(5,2) NOT NULL DEFAULT 50,
  max_attempts INTEGER NOT NULL DEFAULT 1,
  instructions TEXT,
  randomise_questions BOOLEAN NOT NULL DEFAULT false,
  randomise_options BOOLEAN NOT NULL DEFAULT false,
  restrict_navigation BOOLEAN NOT NULL DEFAULT false,
  enable_negative_marking BOOLEAN NOT NULL DEFAULT false,
  negative_mark_penalty NUMERIC(5,2) NOT NULL DEFAULT 0,
  auto_publish_objective_results BOOLEAN NOT NULL DEFAULT false,
  status examination_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 17. examination_questions
CREATE TABLE public.examination_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id),
  order_index INTEGER NOT NULL,
  marks_override NUMERIC(6,2),
  UNIQUE (examination_id, question_id)
);

-- 18. examination_assignments
CREATE TABLE public.examination_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  eligible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (examination_id, student_id)
);

-- 19. examination_attempts
CREATE TABLE public.examination_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  status attempt_status NOT NULL DEFAULT 'in_progress',
  question_order JSONB NOT NULL,
  option_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NOT NULL,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  connection_interruptions INTEGER NOT NULL DEFAULT 0,
  tab_visibility_changes INTEGER NOT NULL DEFAULT 0,
  focus_losses INTEGER NOT NULL DEFAULT 0,
  page_refreshes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (examination_id, student_id, attempt_number)
);

-- 20. student_answers
CREATE TABLE public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.examination_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id),
  response JSONB,
  flagged_for_review BOOLEAN NOT NULL DEFAULT false,
  is_objective_marked BOOLEAN NOT NULL DEFAULT false,
  requires_manual_marking BOOLEAN NOT NULL DEFAULT false,
  marks_awarded NUMERIC(6,2) NOT NULL DEFAULT 0,
  teacher_feedback TEXT,
  marked_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

-- 21. examination_results
CREATE TABLE public.examination_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID UNIQUE NOT NULL REFERENCES public.examination_attempts(id) ON DELETE CASCADE,
  examination_id UUID NOT NULL REFERENCES public.examinations(id),
  student_id UUID NOT NULL REFERENCES public.students(id),
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id),
  term_id UUID NOT NULL REFERENCES public.academic_terms(id),
  class_id UUID NOT NULL REFERENCES public.classes(id),
  subject_id UUID NOT NULL REFERENCES public.subjects(id),
  objective_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  subjective_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  total_possible_marks NUMERIC(8,2) NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  grade TEXT NOT NULL,
  remark TEXT,
  passed BOOLEAN NOT NULL,
  status result_status NOT NULL DEFAULT 'pending_review',
  manual_grading_completed BOOLEAN NOT NULL DEFAULT false,
  correction_reason TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 22. result_approvals
CREATE TABLE public.result_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.examination_results(id) ON DELETE CASCADE,
  reviewer_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  action result_status NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 23. notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  link_view TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 24. examination_incidents
CREATE TABLE public.examination_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  examination_id UUID NOT NULL REFERENCES public.examinations(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.examination_attempts(id) ON DELETE SET NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL REFERENCES public.profiles(id),
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 25. audit_logs
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID NOT NULL REFERENCES public.profiles(id),
  actor_name TEXT NOT NULL,
  actor_role user_role NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 26. school_settings
CREATE TABLE public.school_settings (
  id TEXT PRIMARY KEY DEFAULT 'settings_default',
  school_name TEXT NOT NULL,
  motto TEXT,
  address TEXT,
  email TEXT,
  phone TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#0A1E3D',
  accent_color TEXT NOT NULL DEFAULT '#B8860B',
  default_instructions TEXT,
  grading_scale JSONB NOT NULL,
  allow_partial_multiple_select BOOLEAN NOT NULL DEFAULT true,
  enable_negative_marking_default BOOLEAN NOT NULL DEFAULT false,
  auto_submit_on_tab_limit INTEGER NOT NULL DEFAULT 5,
  allow_student_self_registration BOOLEAN NOT NULL DEFAULT true,
  require_admin_approval_for_students BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_students_class ON public.students(class_id);
CREATE INDEX idx_questions_subject_status ON public.questions(subject_id, approval_status);
CREATE INDEX idx_attempts_exam_student ON public.examination_attempts(examination_id, student_id);
CREATE INDEX idx_results_student_status ON public.examination_results(student_id, status);
CREATE INDEX idx_notifications_recipient ON public.notifications(recipient_profile_id, is_read);
