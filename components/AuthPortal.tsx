'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  GraduationCap,
  KeyRound,
  Layers,
  Lock,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import type { HealthInfo } from '@/lib/api-client';
import { apiFetch, setAuthToken } from '@/lib/api-client';
import type { ClassSubjectSelection, PortalScope } from '@/lib/portal-routing';
import {
  PortalSlideshowBackdrop,
  SlideshowSubheadingHero,
  usePortalSlideshow,
} from './PortalSlideshowBackdrop';

interface AuthPortalProps {
  health: HealthInfo;
  portalScope?: PortalScope;
  onAuthenticated: () => Promise<void>;
  onRefreshHealth: () => Promise<void>;
}

const PORTAL_HEADINGS: Record<
  PortalScope,
  { eyebrow: string; title: string; subtitle: string }
> = {
  gateway: {
    eyebrow: 'Primary 1 to SSS 3 · Academic Portal Directory',
    title: 'JUNEBERRIES INTERNATIONAL SCHOOLS',
    subtitle:
      'Choose your dedicated portal below—Student Registration and CBT Examinations, Teacher Registration and Per-Class Question Setting, or General Admin Executive Oversight.',
  },
  student: {
    eyebrow: 'Student Examination & Assessment Access',
    title: 'Student Login Portal',
    subtitle:
      'Sign in using your Exam Number, Admission / Registration Number, or Student Email to view questions and CBT assessments set for your class.',
  },
  student_register: {
    eyebrow: 'Student Enrollment · Primary 1 to SSS 3',
    title: 'Student Registration Portal',
    subtitle:
      'Register directly as a student using your exam or registration number, student email, and academic class to unlock your class examinations.',
  },
  teacher: {
    eyebrow: 'Academic Faculty · Classroom, Laboratory & Examination Hall',
    title: 'Teacher Login Portal',
    subtitle:
      'Sign in with your Teacher Staff ID or Teacher Email to open your personalized class dashboard and set questions for each class you teach.',
  },
  teacher_register: {
    eyebrow: 'Subject Teacher Onboarding · Multi-Class Assignment',
    title: 'Teacher Registration Portal',
    subtitle:
      'Create your teacher profile with your name, email, and password, and select every class (Primary 1–SSS 3) and subject you handle.',
  },
  questions: {
    eyebrow: 'Teacher Question Setting Workspace',
    title: 'Sign In to Set & Upload Class Questions',
    subtitle:
      'Log in as a registered teacher to access your designated classes (e.g., Primary 4, JSS 3, SS 1, SS 2) and upload questions tailored to each subject.',
  },
  admin: {
    eyebrow: 'Proprietor · CEO · School Owner · Executive Management',
    title: 'General Admin & Proprietor Portal',
    subtitle:
      'Authorized executive portal to monitor teachers’ operations, students’ operations, question approvals, and manage or deactivate staff accounts.',
  },
};

export default function AuthPortal({
  health,
  portalScope = 'gateway',
  onAuthenticated,
  onRefreshHealth,
}: AuthPortalProps) {
  const [showForgot, setShowForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Full-viewport slideshow state synced to current portal scope
  const { activeIndex } = usePortalSlideshow(portalScope, 5200);

  // Login state
  const [identifier, setIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // First-Run Setup state (STRICTLY scoped to /admin only!)
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [bootstrapPasscode, setBootstrapPasscode] = useState('');
  const [seedSampleData, setSeedSampleData] = useState(true);
  const [sampleAccountPassword, setSampleAccountPassword] = useState('');

  // Student Registration state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regAdmNo, setRegAdmNo] = useState('');
  const [regClassId, setRegClassId] = useState(health.classes[0]?.id || '');
  const [regGender, setRegGender] = useState<'Male' | 'Female'>('Female');
  const [regGuardianName, setRegGuardianName] = useState('');
  const [regGuardianPhone, setRegGuardianPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [studentRegisteredOk, setStudentRegisteredOk] = useState(false);

  // Teacher / Staff Registration state
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tStaffNo, setTStaffNo] = useState('');
  const [tDeptId, setTDeptId] = useState(
    health.departments[3]?.id || health.departments[0]?.id || ''
  );
  const [tDesignation, setTDesignation] = useState('Subject Teacher');
  const [tPassword, setTPassword] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<ClassSubjectSelection[]>([]);
  const [teacherRegisteredOk, setTeacherRegisteredOk] = useState(false);

  // Forgot / Reset Password state
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newResetPassword, setNewResetPassword] = useState('');
  const [resetStep, setResetStep] = useState<'request' | 'confirm'>('request');

  const clearMessages = () => {
    setError(null);
    setSuccessMsg(null);
  };

  const toggleTeacherClass = (clsId: string) => {
    setSelectedClassIds((prev) => {
      if (prev.includes(clsId)) {
        setSelectedAssignments((curr) => curr.filter((a) => a.classId !== clsId));
        return prev.filter((id) => id !== clsId);
      }
      return [...prev, clsId];
    });
  };

  const toggleClassSubjectPair = (classId: string, subjectId: string) => {
    setSelectedAssignments((prev) => {
      const exists = prev.some(
        (a) => a.classId === classId && a.subjectId === subjectId
      );
      if (exists) {
        return prev.filter(
          (a) => !(a.classId === classId && a.subjectId === subjectId)
        );
      }
      return [...prev, { classId, subjectId }];
    });
  };

  const groupedClasses = useMemo(() => {
    return {
      primary: health.classes.filter((c) => c.levelGroup === 'primary'),
      junior_secondary: health.classes.filter((c) => c.levelGroup === 'junior_secondary'),
      senior_secondary: health.classes.filter((c) => c.levelGroup === 'senior_secondary'),
    };
  }, [health.classes]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier,
          password: loginPassword,
          portalScope,
        }),
      });
      setAuthToken(res.token);
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string }>('/api/auth/setup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: adminName,
          email: adminEmail,
          password: adminPassword,
          bootstrapPasscode,
          seedSampleData,
          sampleAccountPassword: sampleAccountPassword || adminPassword,
        }),
      });
      setAuthToken(res.token);
      await onRefreshHealth();
      await onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Initial setup failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setStudentRegisteredOk(false);
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/register-student', {
        method: 'POST',
        body: JSON.stringify({
          fullName: regName,
          email: regEmail,
          admissionNumber: regAdmNo,
          classId: regClassId || health.classes[0]?.id,
          gender: regGender,
          guardianName: regGuardianName,
          guardianPhone: regGuardianPhone,
          password: regPassword,
        }),
      });
      setSuccessMsg(res.message);
      setStudentRegisteredOk(true);
      setRegName('');
      setRegEmail('');
      setRegAdmNo('');
      setRegPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleTeacherRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setTeacherRegisteredOk(false);
    if (selectedAssignments.length === 0) {
      setError('Select at least one class and subject you teach.');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/register-staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: tName,
          email: tEmail,
          staffNumber: tStaffNo,
          departmentId: tDeptId,
          designation: tDesignation,
          password: tPassword,
          assignments: selectedAssignments,
        }),
      });
      setSuccessMsg(res.message);
      setTeacherRegisteredOk(true);
      setTName('');
      setTEmail('');
      setTStaffNo('');
      setTPassword('');
      setSelectedClassIds([]);
      setSelectedAssignments([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Teacher registration failed.');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      if (resetStep === 'request') {
        const res = await apiFetch<{ message: string }>('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify({ action: 'request_reset', email: resetEmail }),
        });
        setSuccessMsg(res.message);
        setResetStep('confirm');
      } else {
        const res = await apiFetch<{ message: string }>('/api/auth/password', {
          method: 'POST',
          body: JSON.stringify({
            action: 'confirm_reset',
            email: resetEmail,
            code: resetCode,
            newPassword: newResetPassword,
          }),
        });
        setSuccessMsg(res.message);
        setShowForgot(false);
        setResetStep('request');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    } finally {
      setLoading(false);
    }
  };

  const heading = PORTAL_HEADINGS[portalScope];
  const isLoginPortal =
    portalScope === 'student' ||
    portalScope === 'teacher' ||
    portalScope === 'questions' ||
    portalScope === 'admin';

  // Admin setup ONLY triggers on /admin when no Super Admin exists yet.
  const isAdminFirstRunSetup = portalScope === 'admin' && !health.initialized;

  const navLinks = [
    { href: '/', label: 'Portal Hub', scope: ['gateway'] as PortalScope[] },
    { href: '/student', label: 'Students', scope: ['student'] as PortalScope[] },
    {
      href: '/student/register',
      label: 'Student Sign Up',
      scope: ['student_register'] as PortalScope[],
    },
    {
      href: '/teacher',
      label: 'Teachers',
      scope: ['teacher', 'questions'] as PortalScope[],
    },
    { href: '/admin', label: 'General Admin', scope: ['admin'] as PortalScope[] },
  ];

  const schoolDisplayName = health.schoolName || 'JUNEBERRIES INTERNATIONAL SCHOOLS';

  return (
    <div className="relative min-h-screen flex flex-col text-slate-900">
      {/* Full-Viewport Interactive Video-Like Photo Slideshow Backdrop */}
      <PortalSlideshowBackdrop scope={portalScope} activeIndex={activeIndex} />

      {/* Three-Zone Top Bar */}
      <header className="relative z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-10 py-3.5 sm:py-4 flex items-center justify-between gap-3 sm:gap-8">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 text-left min-w-0">
          <img
            src={health.logoUrl || '/images/juneberry_crest.jpg'}
            alt="JUNEBERRIES INTERNATIONAL SCHOOLS Crest"
            referrerPolicy="no-referrer"
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-md object-cover border border-slate-200 shrink-0"
          />
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-[#0A1E3D] truncate">
            {schoolDisplayName}
          </span>
        </Link>

        <nav
          aria-label="Portal Navigation"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 shrink-0"
        >
          {navLinks.map((item) => {
            const active = item.scope.includes(portalScope);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap shrink-0 transition-colors ${
                  active
                    ? 'text-[#0A1E3D] font-semibold underline underline-offset-8 decoration-[#B8860B] decoration-2'
                    : 'hover:text-slate-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 flex items-center gap-2">
          <Link
            href="/teacher/register"
            className="px-3 sm:px-4 py-2 text-xs font-semibold text-white bg-[#0A1E3D] rounded-lg hover:bg-[#132E59] transition-colors whitespace-nowrap shrink-0"
          >
            Teacher Sign Up
          </Link>
        </div>
      </header>

      {/* Mobile Portal Nav */}
      <div className="relative z-20 flex md:hidden items-center gap-2 px-4 py-2.5 bg-white/95 backdrop-blur-md border-b border-slate-200/80 overflow-x-auto text-xs font-medium">
        {navLinks.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-1.5 rounded-md whitespace-nowrap shrink-0 ${
              item.scope.includes(portalScope)
                ? 'bg-[#0A1E3D] text-white font-semibold'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {/* Main Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-7 lg:py-10">
        {portalScope === 'gateway' ? (
          /* PORTAL DIRECTORY GATEWAY */
          <div className="space-y-7">
            <SlideshowSubheadingHero
              scope="gateway"
              eyebrow={heading.eyebrow}
              title={`${schoolDisplayName} — Examination & Academic Portals`}
              subtitle={heading.subtitle}
            >
              <div className="grid grid-cols-3 gap-4 pt-3 border-t border-white/15 max-w-lg">
                <div>
                  <div className="font-mono-tabular text-2xl font-semibold">12</div>
                  <div className="text-xs text-slate-200">Classes (Pry 1–SSS 3)</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-semibold">
                    {health.subjects.length}
                  </div>
                  <div className="text-xs text-slate-200">Active Subjects</div>
                </div>
                <div>
                  <div className="font-mono-tabular text-2xl font-semibold">5</div>
                  <div className="text-xs text-slate-200">Dedicated Portals</div>
                </div>
              </div>
            </SlideshowSubheadingHero>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* 1. Student Login */}
              <Link
                href="/student"
                className="group bg-white/95 backdrop-blur-md border border-white/50 hover:border-[#0A1E3D] rounded-xl p-6 flex flex-col justify-between gap-4 shadow-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#0A1E3D]/10 text-[#0A1E3D] flex items-center justify-center">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Student Login Portal
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Sign in with your Exam Number, Registration Number, or Email to access CBT exams and questions set for your class.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#0A1E3D] flex items-center gap-1.5 group-hover:underline">
                  <span>Enter Student Login</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              {/* 2. Student Registration */}
              <Link
                href="/student/register"
                className="group bg-white/95 backdrop-blur-md border border-white/50 hover:border-[#0A1E3D] rounded-xl p-6 flex flex-col justify-between gap-4 shadow-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#B8860B]/15 text-[#9A6F04] flex items-center justify-center">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Student Registration Portal
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    New student? Sign up directly using your exam or admission number, student email, and academic class (Primary 1–SSS 3).
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#0A1E3D] flex items-center gap-1.5 group-hover:underline">
                  <span>Register as a Student</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              {/* 3. Teacher Login & Per-Class Dashboard */}
              <Link
                href="/teacher"
                className="group bg-white/95 backdrop-blur-md border border-white/50 hover:border-[#0A1E3D] rounded-xl p-6 flex flex-col justify-between gap-4 shadow-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#0A1E3D]/10 text-[#0A1E3D] flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Teacher Login &amp; Question Studio
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Teachers sign in to open their class-by-class dashboard and upload questions for each class and subject they teach.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#0A1E3D] flex items-center gap-1.5 group-hover:underline">
                  <span>Teacher Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              {/* 4. Teacher Registration */}
              <Link
                href="/teacher/register"
                className="group bg-white/95 backdrop-blur-md border border-white/50 hover:border-[#0A1E3D] rounded-xl p-6 flex flex-col justify-between gap-4 shadow-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-lg bg-[#B8860B]/15 text-[#9A6F04] flex items-center justify-center">
                    <Layers className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Teacher Registration Portal
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Teachers sign up here with their email and password and choose every class (Primary 1–SSS 3) and subject they handle.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#0A1E3D] flex items-center gap-1.5 group-hover:underline">
                  <span>Register &amp; Select Classes</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>

              {/* 5. General Admin / Proprietor Portal */}
              <Link
                href="/admin"
                className="md:col-span-2 group bg-[#0A1E3D]/92 backdrop-blur-md text-white border border-white/20 hover:bg-[#132E59] rounded-xl p-6 flex flex-col justify-between gap-4 shadow-lg transition-all"
              >
                <div className="space-y-2.5">
                  <div className="w-10 h-10 rounded-lg bg-white/10 text-[#E6C567] flex items-center justify-center">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h2 className="font-display text-lg font-bold text-white">
                    General Admin &amp; Proprietor Executive Portal
                  </h2>
                  <p className="text-sm text-slate-200 leading-relaxed max-w-2xl">
                    Dedicated executive portal for the Proprietor, CEO, School Owner, Principal, and Exam Officer to monitor teachers’ operations, students’ exam progress, and deactivate or remove staff accounts.
                  </p>
                </div>
                <div className="text-xs font-semibold text-[#E6C567] flex items-center gap-1.5 group-hover:underline">
                  <span>Open General Admin Portal</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </Link>
            </div>
          </div>
        ) : (
          /* DEDICATED ROLE-SPECIFIC PORTAL WORKSPACE WITH VISIBLE SLIDESHOW SUBHEADING */
          <div className="space-y-6">
            {/* Prominent Interactive Video-Like Slideshow Subheading */}
            <SlideshowSubheadingHero
              scope={portalScope}
              eyebrow={heading.eyebrow}
              title={heading.title}
              subtitle={heading.subtitle}
              compact
            >
              <div className="flex flex-wrap items-center gap-4 text-xs">
                {portalScope === 'student' && (
                  <Link
                    href="/student/register"
                    className="font-semibold text-[#E6C567] hover:underline"
                  >
                    New Student? Register in the Student Registration Portal →
                  </Link>
                )}
                {portalScope === 'student_register' && (
                  <Link
                    href="/student"
                    className="font-semibold text-[#E6C567] hover:underline"
                  >
                    Already registered? Sign in at the Student Login Portal →
                  </Link>
                )}
                {(portalScope === 'teacher' || portalScope === 'questions') && (
                  <Link
                    href="/teacher/register"
                    className="font-semibold text-[#E6C567] hover:underline"
                  >
                    New Teacher? Register &amp; select your classes/subjects →
                  </Link>
                )}
                {portalScope === 'teacher_register' && (
                  <Link
                    href="/teacher"
                    className="font-semibold text-[#E6C567] hover:underline"
                  >
                    Already registered? Sign in at the Teacher Login Portal →
                  </Link>
                )}
                <Link href="/" className="text-slate-200 hover:text-white hover:underline">
                  ← Back to All Portals
                </Link>
              </div>
            </SlideshowSubheadingHero>

            {/* Focused Form Container (Translucent Surface Over Live Campus Slideshow) */}
            <section className="max-w-3xl mx-auto bg-white/95 backdrop-blur-md rounded-xl border border-white/60 shadow-2xl p-6 sm:p-8 lg:p-9">
              {error && (
                <div role="alert" className="mb-5 p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
                  {error}
                </div>
              )}

              {successMsg && (
                <div role="status" className="mb-5 p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-700" />
                    <span>{successMsg}</span>
                  </div>
                  {studentRegisteredOk && (
                    <Link
                      href="/student"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
                    >
                      <span>Proceed to Student Login Portal</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                  {teacherRegisteredOk && (
                    <Link
                      href="/teacher"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A1E3D] text-white text-xs font-semibold rounded-lg"
                    >
                      <span>Sign In to Your Teacher Class Dashboard</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  )}
                </div>
              )}

              {/* STRICTLY /admin ONLY: First-Run General Admin Provisioning */}
              {isAdminFirstRunSetup ? (
                <form onSubmit={handleSetup} className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#B8860B] mb-1">
                      <ShieldCheck className="w-4 h-4" />
                      <span>First-Run Proprietor / General Administrator Setup</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-slate-900">
                      Create General Administrator Account
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Provision the primary Proprietor / General Administrator login for {schoolDisplayName}. Once completed, this portal switches to General Admin sign-in.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="setup-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Administrator / Proprietor Full Name
                      </label>
                      <input
                        id="setup-name"
                        type="text"
                        required
                        placeholder="e.g. Chief Proprietor Adewale"
                        value={adminName}
                        onChange={(e) => setAdminName(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                      />
                    </div>
                    <div>
                      <label htmlFor="setup-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Official Administrator Email
                      </label>
                      <input
                        id="setup-email"
                        type="email"
                        required
                        placeholder="admin@juneberries.edu.ng"
                        value={adminEmail}
                        onChange={(e) => setAdminEmail(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="setup-password" className="block text-xs font-medium text-slate-700 mb-1">
                      Administrator Password (min 8 characters)
                    </label>
                    <div className="relative">
                      <input
                        id="setup-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        minLength={8}
                        placeholder="Choose a strong password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {health.requiresBootstrapPasscode && (
                    <div>
                      <label htmlFor="setup-passcode" className="block text-xs font-medium text-slate-700 mb-1">
                        Server Bootstrap Passcode
                      </label>
                      <input
                        id="setup-passcode"
                        type="password"
                        required
                        value={bootstrapPasscode}
                        onChange={(e) => setBootstrapPasscode(e.target.value)}
                        className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}

                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={seedSampleData}
                        onChange={(e) => setSeedSampleData(e.target.checked)}
                        className="mt-1 rounded border-slate-300"
                      />
                      <span className="text-xs text-slate-700 leading-relaxed">
                        <strong className="text-slate-900">Load sample school curriculum &amp; test records</strong>{' '}
                        (Primary 6, JSS 3, SSS 2 sample students, teachers, HOD, Exam Officer, Invigilator, Question Bank, and sample CBT exams).
                      </span>
                    </label>

                    {seedSampleData && (
                      <div>
                        <label htmlFor="sample-pw" className="block text-xs font-medium text-slate-700 mb-1">
                          Password for Sample Staff &amp; Student Accounts (defaults to Admin password if blank)
                        </label>
                        <input
                          id="sample-pw"
                          type="password"
                          placeholder="Optional separate sandbox password (min 8 chars)"
                          value={sampleAccountPassword}
                          onChange={(e) => setSampleAccountPassword(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-60 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Lock className="w-4 h-4" />
                    <span>{loading ? 'Provisioning General Admin...' : 'Claim General Admin Account'}</span>
                  </button>
                </form>
              ) : showForgot ? (
                /* PASSWORD RECOVERY */
                <form onSubmit={handlePasswordReset} className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#B8860B] mb-1">
                      <KeyRound className="w-4 h-4" />
                      <span>Account Recovery</span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900">
                      {resetStep === 'request'
                        ? 'Request Password Reset'
                        : 'Enter 6-Digit Reset Code'}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Reset requests notify the General Administrator who issues your one-time verification code.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="reset-email" className="block text-xs font-medium text-slate-700 mb-1">
                      Registered Email Address
                    </label>
                    <input
                      id="reset-email"
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  {resetStep === 'confirm' && (
                    <>
                      <div>
                        <label htmlFor="reset-code" className="block text-xs font-medium text-slate-700 mb-1">
                          6-Digit Verification Code
                        </label>
                        <input
                          id="reset-code"
                          type="text"
                          required
                          value={resetCode}
                          onChange={(e) => setResetCode(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label htmlFor="reset-new-pw" className="block text-xs font-medium text-slate-700 mb-1">
                          New Password (min 8 characters)
                        </label>
                        <input
                          id="reset-new-pw"
                          type="password"
                          required
                          minLength={8}
                          value={newResetPassword}
                          onChange={(e) => setNewResetPassword(e.target.value)}
                          className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                    </>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={loading}
                      className="flex-1 py-2.5 px-4 bg-[#0A1E3D] text-white text-sm font-semibold rounded-lg"
                    >
                      {resetStep === 'request' ? 'Submit Reset Request' : 'Confirm New Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearMessages();
                        setShowForgot(false);
                      }}
                      className="py-2.5 px-4 border border-slate-300 text-sm font-medium rounded-lg"
                    >
                      Back to Login
                    </button>
                  </div>
                </form>
              ) : isLoginPortal ? (
                /* STRICTLY ROLE-SCOPED SIGN IN */
                <form onSubmit={handleLogin} className="space-y-5">
                  <div>
                    <h3 className="font-display text-2xl font-bold text-slate-900">
                      {portalScope === 'student'
                        ? 'Student Sign In'
                        : portalScope === 'teacher' || portalScope === 'questions'
                          ? 'Teacher Sign In'
                          : 'General Admin & Proprietor Sign In'}
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      {portalScope === 'student'
                        ? 'Enter your Student Exam Number, Registration Number (e.g. JBS/2026/001), or Student Email.'
                        : portalScope === 'teacher' || portalScope === 'questions'
                          ? 'Enter your Teacher Staff ID (e.g. JBS/STF/015) or Teacher Email Address to open your class workspace.'
                          : 'Enter your General Admin, Proprietor, Principal, or Exam Officer credentials.'}
                    </p>
                  </div>

                  <div>
                    <label htmlFor="login-identifier" className="block text-xs font-medium text-slate-700 mb-1.5">
                      {portalScope === 'student'
                        ? 'Exam / Registration Number or Student Email'
                        : portalScope === 'admin'
                          ? 'Administrator Email or Admin Staff ID'
                          : 'Teacher Staff ID or Teacher Email'}
                    </label>
                    <input
                      id="login-identifier"
                      type="text"
                      required
                      autoComplete="username"
                      placeholder={
                        portalScope === 'student'
                          ? 'JBS/2026/015 or student@juneberries.edu.ng'
                          : portalScope === 'admin'
                            ? 'admin@juneberries.edu.ng'
                            : 'JBS/STF/015 or teacher@juneberries.edu.ng'
                      }
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label htmlFor="login-password" className="block text-xs font-medium text-slate-700">
                        {portalScope === 'student'
                          ? 'Student Password'
                          : portalScope === 'admin'
                            ? 'Administrator Password'
                            : 'Teacher Password'}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          clearMessages();
                          setShowForgot(true);
                        }}
                        className="text-xs font-medium text-[#163A70] hover:underline"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        autoComplete="current-password"
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        className="w-full px-3.5 py-2.5 pr-10 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0A1E3D]"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-700"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <span>
                      {loading
                        ? 'Verifying Credentials...'
                        : portalScope === 'student'
                          ? 'Sign In to Student Portal'
                          : portalScope === 'questions'
                            ? 'Sign In to Set Class Questions'
                            : portalScope === 'admin'
                              ? 'Sign In to General Admin Portal'
                              : 'Sign In to Teacher Dashboard'}
                    </span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  {portalScope === 'student' && (
                    <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                      <span>Don&apos;t have a student account yet?</span>
                      <Link
                        href="/student/register"
                        className="font-semibold text-[#0A1E3D] hover:underline"
                      >
                        Create Student Account →
                      </Link>
                    </div>
                  )}

                  {(portalScope === 'teacher' || portalScope === 'questions') && (
                    <div className="pt-3 border-t border-slate-200 text-xs text-slate-600 flex items-center justify-between gap-2">
                      <span>New teacher at {schoolDisplayName}?</span>
                      <Link
                        href="/teacher/register"
                        className="font-semibold text-[#0A1E3D] hover:underline"
                      >
                        Register as Teacher →
                      </Link>
                    </div>
                  )}
                </form>
              ) : portalScope === 'student_register' ? (
                /* STRICTLY STUDENT REGISTRATION FORM */
                <form onSubmit={handleStudentRegister} className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#B8860B] mb-1">
                      <GraduationCap className="w-4 h-4" />
                      <span>Student Enrollment</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-slate-900">
                      Student Sign Up
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Register with your student details and academic class (Primary 1 to SSS 3) to see assessments prepared for your class.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="reg-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Student Full Name
                      </label>
                      <input
                        id="reg-name"
                        type="text"
                        required
                        placeholder="Surname Firstname"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-adm" className="block text-xs font-medium text-slate-700 mb-1">
                        Exam / Registration / Admission Number
                      </label>
                      <input
                        id="reg-adm"
                        type="text"
                        required
                        placeholder="e.g. JBS/2026/015 or EXM/2026/015"
                        value={regAdmNo}
                        onChange={(e) => setRegAdmNo(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="reg-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Student Email Address
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        placeholder="student@juneberries.edu.ng"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-class" className="block text-xs font-medium text-slate-700 mb-1">
                        Academic Class (Primary 1 – SSS 3)
                      </label>
                      <select
                        id="reg-class"
                        value={regClassId}
                        onChange={(e) => setRegClassId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {health.classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                    <div>
                      <label htmlFor="reg-gender" className="block text-xs font-medium text-slate-700 mb-1">
                        Gender
                      </label>
                      <select
                        id="reg-gender"
                        value={regGender}
                        onChange={(e) => setRegGender(e.target.value as 'Male' | 'Female')}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="Female">Female</option>
                        <option value="Male">Male</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="reg-gname" className="block text-xs font-medium text-slate-700 mb-1">
                        Parent / Guardian Name
                      </label>
                      <input
                        id="reg-gname"
                        type="text"
                        placeholder="Parent or guardian name"
                        value={regGuardianName}
                        onChange={(e) => setRegGuardianName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="reg-gphone" className="block text-xs font-medium text-slate-700 mb-1">
                        Parent / Guardian Phone
                      </label>
                      <input
                        id="reg-gphone"
                        type="tel"
                        placeholder="+234 800 000 0000"
                        value={regGuardianPhone}
                        onChange={(e) => setRegGuardianPhone(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-password" className="block text-xs font-medium text-slate-700 mb-1">
                      Create Student Password (min 8 characters)
                    </label>
                    <input
                      id="reg-password"
                      type="password"
                      required
                      minLength={8}
                      placeholder="Choose your student portal password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {loading ? 'Registering Student...' : 'Complete Student Registration'}
                  </button>
                </form>
              ) : (
                /* STRICTLY TEACHER REGISTRATION WITH MULTI-CLASS & SUBJECT PICKER */
                <form onSubmit={handleTeacherRegister} className="space-y-5">
                  <div>
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#B8860B] mb-1">
                      <Users className="w-4 h-4" />
                      <span>Teacher Account &amp; Class Assignment</span>
                    </div>
                    <h3 className="font-display text-2xl font-bold text-slate-900">
                      Teacher Sign Up
                    </h3>
                    <p className="text-sm text-slate-600 mt-1">
                      Enter your teacher profile and select every class (Primary 1–SSS 3) and subject you teach so your personal dashboard opens directly to those classes.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="t-name" className="block text-xs font-medium text-slate-700 mb-1">
                        Teacher Full Name
                      </label>
                      <input
                        id="t-name"
                        type="text"
                        required
                        placeholder="e.g. Mr. Kolawole Adeyemi"
                        value={tName}
                        onChange={(e) => setTName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-staffno" className="block text-xs font-medium text-slate-700 mb-1">
                        Teacher Staff ID
                      </label>
                      <input
                        id="t-staffno"
                        type="text"
                        required
                        placeholder="e.g. JBS/STF/015"
                        value={tStaffNo}
                        onChange={(e) => setTStaffNo(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono-tabular border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="t-email" className="block text-xs font-medium text-slate-700 mb-1">
                        Teacher Email Address
                      </label>
                      <input
                        id="t-email"
                        type="email"
                        required
                        placeholder="teacher@juneberries.edu.ng"
                        value={tEmail}
                        onChange={(e) => setTEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-dept" className="block text-xs font-medium text-slate-700 mb-1">
                        Academic Department
                      </label>
                      <select
                        id="t-dept"
                        value={tDeptId}
                        onChange={(e) => setTDeptId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                      >
                        {health.departments.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div>
                      <label htmlFor="t-desig" className="block text-xs font-medium text-slate-700 mb-1">
                        Teaching Designation
                      </label>
                      <input
                        id="t-desig"
                        type="text"
                        required
                        placeholder="e.g. Mathematics & Physics Teacher"
                        value={tDesignation}
                        onChange={(e) => setTDesignation(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label htmlFor="t-pw" className="block text-xs font-medium text-slate-700 mb-1">
                        Create Teacher Password (min 8 characters)
                      </label>
                      <input
                        id="t-pw"
                        type="password"
                        required
                        minLength={8}
                        placeholder="Choose your teacher portal password"
                        value={tPassword}
                        onChange={(e) => setTPassword(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  {/* Step 1: Select Classes Taught */}
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-900">
                        1. Select Classes You Teach (Primary 1 – SSS 3)
                      </div>
                      <span className="font-mono-tabular text-[11px] text-slate-600">
                        {selectedClassIds.length} class{selectedClassIds.length === 1 ? '' : 'es'} selected
                      </span>
                    </div>

                    <div className="space-y-2.5 text-xs">
                      {[
                        { label: 'Primary', items: groupedClasses.primary },
                        { label: 'Junior Secondary', items: groupedClasses.junior_secondary },
                        { label: 'Senior Secondary', items: groupedClasses.senior_secondary },
                      ].map((group) => (
                        <div key={group.label} className="space-y-1.5">
                          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.items.map((c) => {
                              const active = selectedClassIds.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => toggleTeacherClass(c.id)}
                                  className={`px-3 py-1.5 rounded-md border font-medium transition-colors ${
                                    active
                                      ? 'bg-[#0A1E3D] text-white border-[#0A1E3D]'
                                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                  }`}
                                >
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Step 2: Select Subjects for each selected Class */}
                    {selectedClassIds.length > 0 && (
                      <div className="pt-3 border-t border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-bold text-slate-900">
                            2. Tick Subjects You Teach in Each Selected Class
                          </div>
                          <span className="font-mono-tabular text-[11px] font-semibold text-[#0A1E3D]">
                            {selectedAssignments.length} subject assignment
                            {selectedAssignments.length === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                          {selectedClassIds.map((clsId) => {
                            const cls = health.classes.find((c) => c.id === clsId);
                            const classSubs = health.subjects.filter(
                              (s) =>
                                s.applicableClassIds.length === 0 ||
                                s.applicableClassIds.includes(clsId)
                            );
                            return (
                              <div
                                key={clsId}
                                className="bg-white border border-slate-200 rounded-lg p-3 space-y-2"
                              >
                                <div className="text-xs font-bold text-[#0A1E3D]">
                                  {cls?.name} Subjects
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                  {classSubs.map((sub) => {
                                    const checked = selectedAssignments.some(
                                      (a) => a.classId === clsId && a.subjectId === sub.id
                                    );
                                    return (
                                      <label
                                        key={`${clsId}_${sub.id}`}
                                        className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() =>
                                            toggleClassSubjectPair(clsId, sub.id)
                                          }
                                        />
                                        <span className="truncate">{sub.name}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-[#0A1E3D] hover:bg-[#132E59] disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {loading
                      ? 'Creating Teacher Account...'
                      : 'Complete Teacher Registration'}
                  </button>
                </form>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
