import { NextRequest, NextResponse } from 'next/server';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/security';
import {
  type ClassSubjectSelection,
  validateStaffAssignments,
} from '@/lib/portal-routing';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fullName?: string;
      email?: string;
      staffNumber?: string;
      departmentId?: string;
      designation?: string;
      password?: string;
      assignments?: ClassSubjectSelection[];
    };

    const fullName = body.fullName?.trim() || '';
    const email = body.email?.trim().toLowerCase() || '';
    const staffNumber = body.staffNumber?.trim().toUpperCase() || '';
    const departmentId = body.departmentId?.trim() || '';
    const designation = body.designation?.trim() || 'Subject Teacher';
    const password = body.password || '';
    const rawAssignments = Array.isArray(body.assignments) ? body.assignments : [];

    if (!fullName || !email || !email.includes('@') || !staffNumber || !departmentId) {
      return NextResponse.json(
        {
          error:
            'Full name, valid email, unique Staff ID, and academic department are required.',
        },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9][A-Z0-9/_-]{3,23}$/.test(staffNumber)) {
      return NextResponse.json(
        {
          error:
            'Staff ID must be 4–24 alphanumeric characters (e.g. JBS/STF/015).',
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
      if (db.profiles.some((p) => p.email.toLowerCase() === email)) {
        return {
          error: 'An account with this email address already exists.',
          status: 409 as const,
        };
      }

      if (db.staff.some((s) => s.staffNumber.toUpperCase() === staffNumber)) {
        return {
          error: `Staff ID ${staffNumber} is already registered.`,
          status: 409 as const,
        };
      }

      const dept = db.departments.find((d) => d.id === departmentId && d.isActive);
      if (!dept) {
        return { error: 'Selected academic department is invalid.', status: 400 as const };
      }

      const checked = validateStaffAssignments(rawAssignments, db.classes, db.subjects);
      if (checked.error || checked.valid.length === 0) {
        return {
          error: checked.error || 'Select at least one class and subject.',
          status: 400 as const,
        };
      }

      const now = new Date().toISOString();
      const profileId = newId('prof_stf');
      const staffId = newId('staff');
      const currentSessionId =
        db.sessions.find((s) => s.isCurrent)?.id || db.sessions[0]?.id || 'sess_2026_2027';

      // Public staff registration strictly creates 'teacher' role; elevated roles require Super Admin.
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

      return {
        status: 201 as const,
        staffNumber,
        assignmentCount: checked.valid.length,
      };
    });

    if ('error' in res) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }

    return NextResponse.json(
      {
        message: `Teacher account created for ${res.staffNumber} with ${res.assignmentCount} class & subject assignment(s). You can now sign in to set questions for your classes.`,
        staffNumber: res.staffNumber,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: 'Invalid teacher registration payload.' },
      { status: 400 }
    );
  }
}
