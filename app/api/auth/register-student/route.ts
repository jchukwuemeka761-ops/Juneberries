import { NextRequest, NextResponse } from 'next/server';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/security';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fullName?: string;
      email?: string;
      admissionNumber?: string;
      classId?: string;
      departmentId?: string;
      gender?: 'Male' | 'Female';
      guardianName?: string;
      guardianPhone?: string;
      password?: string;
    };

    const fullName = body.fullName?.trim() || '';
    const email = body.email?.trim().toLowerCase() || '';
    const admissionNumber = body.admissionNumber?.trim().toUpperCase() || '';
    const classId = body.classId?.trim() || '';
    const password = body.password || '';

    if (!fullName || !email || !email.includes('@') || !admissionNumber || !classId) {
      return NextResponse.json(
        {
          error:
            'Full name, valid email, unique admission number, and academic class are required.',
        },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9][A-Z0-9/_-]{3,24}$/.test(admissionNumber)) {
      return NextResponse.json(
        {
          error:
            'Exam / Admission / Registration number must be 4–25 alphanumeric characters (e.g. JBS/2026/015 or EXM/2026/015).',
        },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const res = await mutateDb((db) => {
      if (!db.settings.allowStudentSelfRegistration) {
        return {
          error: 'Student self-registration is currently disabled by administration.',
          status: 403 as const,
        };
      }

      if (db.profiles.some((p) => p.email.toLowerCase() === email)) {
        return {
          error: 'An account with this email address already exists.',
          status: 409 as const,
        };
      }

      if (
        db.students.some(
          (s) => s.admissionNumber.toUpperCase() === admissionNumber
        )
      ) {
        return {
          error: `Admission number ${admissionNumber} is already registered.`,
          status: 409 as const,
        };
      }

      const targetClass = db.classes.find((c) => c.id === classId && c.isActive);
      if (!targetClass) {
        return { error: 'Selected academic class does not exist.', status: 400 as const };
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
        departmentId: body.departmentId || targetClass.departmentId,
        gender: body.gender === 'Female' ? 'Female' : 'Male',
        guardianName: body.guardianName?.trim(),
        guardianPhone: body.guardianPhone?.trim(),
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

      // Notify all super admins
      for (const admin of db.profiles.filter((p) => p.role === 'super_admin')) {
        db.notifications.unshift({
          id: newId('notif'),
          recipientProfileId: admin.id,
          title: 'New Student Registration Pending Activation',
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

      return {
        status: 201 as const,
        requiresApproval,
        admissionNumber,
      };
    });

    if ('error' in res) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    return NextResponse.json(
      {
        message: res.requiresApproval
          ? `Registration submitted for ${res.admissionNumber}. An administrator will verify your admission number and activate your portal access.`
          : `Account activated for ${res.admissionNumber}. You may now sign in.`,
        requiresApproval: res.requiresApproval,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid registration payload.' },
      { status: 400 }
    );
  }
}
