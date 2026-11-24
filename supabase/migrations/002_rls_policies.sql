-- Juneberry International Schools CBT Portal — Row Level Security (RLS) Policies
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.examination_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles: users read own profile; admins & exam officers read all
CREATE POLICY "profiles_select_self_or_admin" ON public.profiles
  FOR SELECT USING (
    id = auth.uid() OR public.current_user_role() IN ('super_admin', 'exam_officer', 'principal')
  );

-- Students: own record only; staff/admins read appropriately
CREATE POLICY "students_select_scoped" ON public.students
  FOR SELECT USING (
    profile_id = auth.uid() OR public.current_user_role() IN ('super_admin', 'exam_officer', 'principal', 'hod', 'teacher', 'invigilator')
  );

-- Questions: NEVER allow students direct table access (answers protected; delivery happens only via Edge Function)
CREATE POLICY "questions_staff_only" ON public.questions
  FOR SELECT USING (
    public.current_user_role() IN ('super_admin', 'exam_officer', 'hod')
    OR (public.current_user_role() = 'teacher' AND teacher_profile_id = auth.uid())
  );

-- Attempts: students see only their own attempts; staff see monitored attempts
CREATE POLICY "attempts_select_scoped" ON public.examination_attempts
  FOR SELECT USING (
    student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
    OR public.current_user_role() IN ('super_admin', 'exam_officer', 'principal', 'invigilator', 'teacher')
  );

-- Student Answers: students see/write own in-progress answers before deadline
CREATE POLICY "answers_select_own" ON public.student_answers
  FOR SELECT USING (
    attempt_id IN (
      SELECT ea.id FROM public.examination_attempts ea
      JOIN public.students s ON s.id = ea.student_id
      WHERE s.profile_id = auth.uid()
    )
    OR public.current_user_role() IN ('super_admin', 'exam_officer', 'teacher')
  );

-- Results: students see ONLY their own PUBLISHED results
CREATE POLICY "results_student_published_only" ON public.examination_results
  FOR SELECT USING (
    (
      status = 'published' AND
      student_id IN (SELECT id FROM public.students WHERE profile_id = auth.uid())
    )
    OR public.current_user_role() IN ('super_admin', 'exam_officer', 'principal', 'hod', 'teacher')
  );

-- Notifications: recipient only
CREATE POLICY "notifications_own" ON public.notifications
  FOR ALL USING (recipient_profile_id = auth.uid());

-- Audit logs: Super Admin only
CREATE POLICY "audit_logs_admin_only" ON public.audit_logs
  FOR SELECT USING (public.current_user_role() = 'super_admin');
