import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, forbiddenResponse, unauthorizedResponse } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { hashPassword, isValidSafeUrl } from '@/lib/server/security';
import {
  type ClassSubjectSelection,
  checkStaffAccountMutationGuard,
  validateStaffAssignments,
} from '@/lib/portal-routing';
import type { GradeBand, UserRole } from '@/lib/types';

export async function POST(req: NextRequest) {
  const auth = await authenticateRequest(req);
  if (!auth) return unauthorizedResponse();

  const me = auth.profile;

  try {
    const body = (await req.json()) as {
      action: string;
      payload?: Record<string, unknown>;
    };

    const action = body.action;
    const p = body.payload || {};

    // Notifications read action allowed for all authenticated users
    if (action === 'mark_notification_read') {
      const id = String(p.id || '');
      await mutateDb((db) => {
        for (const n of db.notifications) {
          if (n.recipientProfileId === me.id && (!id || n.id === id)) {
            n.isRead = true;
          }
        }
      });
      return NextResponse.json({ ok: true });
    }

    // Only Super Admin (and Exam Officer for specific academic/student ops) below
    const isAdmin = me.role === 'super_admin';
    const isExamOfficer = me.role === 'exam_officer';

    if (!isAdmin && !isExamOfficer) {
      return forbiddenResponse('Administrative privileges required.');
    }

    if (action === 'create_student' || action === 'bulk_import_students') {
      if (!isAdmin) return forbiddenResponse('Only Super Admin can provision student accounts.');
      const items =
        action === 'bulk_import_students'
          ? (p.students as Array<Record<string, string>>) || []
          : [p as Record<string, string>];

      if (items.length === 0) {
        return NextResponse.json({ error: 'No student records provided.' }, { status: 400 });
      }

      const result = await mutateDb((db) => {
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
            skipped.push({
              admissionNumber,
              reason: 'Duplicate email or admission number.',
            });
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

        return { created, skipped };
      });

      return NextResponse.json(result);
    }

    if (action === 'update_student_status' || action === 'promote_transfer_student') {
      if (!isAdmin) return forbiddenResponse();
      const studentId = String(p.studentId || '');
      const res = await mutateDb((db) => {
        const stu = db.students.find((s) => s.id === studentId);
        if (!stu) return { error: 'Student not found.', status: 404 as const };
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
              message: `Your Juneberries CBT account (${stu.admissionNumber}) is now active.`,
              category: 'account',
              isRead: false,
              createdAt: new Date().toISOString(),
            });
          }
          appendAuditLog(db, me, 'STUDENT_STATUS_UPDATED', 'student', stu.id, `Updated status to ${nextStatus}.`);
          return { status: 200 as const };
        } else {
          const targetClassId = String(p.classId || '');
          const targetCls = db.classes.find((c) => c.id === targetClassId);
          if (!targetCls) return { error: 'Target class not found.', status: 400 as const };
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
          return { status: 200 as const };
        }
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_staff') {
      if (!isAdmin) return forbiddenResponse();
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
        return NextResponse.json(
          { error: 'Full name, email, staff number, designation, and password (min 8 chars) are required.' },
          { status: 400 }
        );
      }
      if (role === 'student') {
        return NextResponse.json({ error: 'Use student provisioning for student accounts.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        if (
          db.profiles.some((pr) => pr.email.toLowerCase() === email) ||
          db.staff.some((st) => st.staffNumber.toUpperCase() === staffNumber)
        ) {
          return { error: 'Email or staff number already exists.', status: 409 as const };
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
        return { status: 201 as const, staffId };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true, staffId: res.staffId }, { status: 201 });
    }

    if (action === 'update_staff_role' || action === 'update_staff_status') {
      if (!isAdmin) return forbiddenResponse();
      const profileId = String(p.profileId || '');
      const role = p.role ? (String(p.role) as UserRole) : undefined;
      const isActive = typeof p.isActive === 'boolean' ? p.isActive : undefined;

      const res = await mutateDb((db) => {
        const prof = db.profiles.find((pr) => pr.id === profileId && pr.role !== 'student');
        if (!prof) return { error: 'Staff profile not found.', status: 404 as const };

        const operation =
          isActive === false
            ? 'deactivate'
            : role && role !== prof.role
              ? 'change_role'
              : 'change_role';

        if (isActive === false || (role && role !== prof.role)) {
          const guard = checkStaffAccountMutationGuard({
            actorProfileId: me.id,
            targetProfile: prof,
            allProfiles: db.profiles,
            operation,
            nextRole: role,
          });
          if (!guard.allowed) {
            return { error: guard.error || 'Operation prohibited.', status: 400 as const };
          }
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
        return { status: 200 as const };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete_staff') {
      if (!isAdmin) return forbiddenResponse();
      const staffId = String(p.staffId || '');
      const profileId = String(p.profileId || '');
      if (!staffId && !profileId) {
        return NextResponse.json({ error: 'Staff ID or Profile ID is required.' }, { status: 400 });
      }

      const res = await mutateDb((db) => {
        const staffRec = db.staff.find(
          (st) => (staffId && st.id === staffId) || (profileId && st.profileId === profileId)
        );
        const targetProfileId = staffRec?.profileId || profileId;
        const prof = db.profiles.find(
          (pr) => pr.id === targetProfileId && pr.role !== 'student'
        );
        if (!prof) {
          return { error: 'Staff account not found.', status: 404 as const };
        }

        const guard = checkStaffAccountMutationGuard({
          actorProfileId: me.id,
          targetProfile: prof,
          allProfiles: db.profiles,
          operation: 'delete',
        });
        if (!guard.allowed) {
          return { error: guard.error || 'Cannot delete this staff account.', status: 400 as const };
        }

        const deletedName = prof.fullName;
        const deletedEmail = prof.email;
        const deletedStaffNo = staffRec?.staffNumber || prof.id;

        if (staffRec) {
          for (const dept of db.departments) {
            if (dept.hodStaffId === staffRec.id) {
              dept.hodStaffId = undefined;
            }
          }
          db.teacherAssignments = db.teacherAssignments.filter(
            (ta) => ta.staffId !== staffRec.id
          );
          db.staff = db.staff.filter((st) => st.id !== staffRec.id);
        }

        db.notifications = db.notifications.filter(
          (n) => n.recipientProfileId !== prof.id
        );
        db.passwordResetTokens = db.passwordResetTokens.filter(
          (t) => t.profileId !== prof.id
        );
        db.profiles = db.profiles.filter((pr) => pr.id !== prof.id);

        appendAuditLog(
          db,
          me,
          'STAFF_DELETED',
          'staff',
          staffRec?.id || prof.id,
          `Permanently deleted staff member ${deletedName} (${deletedStaffNo} · ${deletedEmail}) and revoked login credentials.`
        );
        return { status: 200 as const };
      });
      if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status });
      return NextResponse.json({ ok: true });
    }

    if (action === 'assign_teacher') {
      const staffId = String(p.staffId || '');
      const classId = String(p.classId || '');
      const subjectId = String(p.subjectId || '');
      if (!staffId || !classId || !subjectId) {
        return NextResponse.json({ error: 'Staff, class, and subject are required.' }, { status: 400 });
      }
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_teacher_assignment') {
      if (!isAdmin) return forbiddenResponse();
      const assignmentId = String(p.assignmentId || '');
      if (!assignmentId) {
        return NextResponse.json({ error: 'Assignment ID is required.' }, { status: 400 });
      }
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_department') {
      if (!isAdmin) return forbiddenResponse();
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const description = String(p.description || '').trim();
      if (!name || !code) return NextResponse.json({ error: 'Department name and code are required.' }, { status: 400 });
      await mutateDb((db) => {
        db.departments.push({
          id: newId('dept'),
          name,
          code,
          description,
          isActive: true,
          createdAt: new Date().toISOString(),
        });
        appendAuditLog(db, me, 'DEPARTMENT_CREATED', 'department', code, `Created department ${name}.`);
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_class') {
      if (!isAdmin) return forbiddenResponse();
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const levelGroup = String(p.levelGroup || 'senior_secondary') as 'primary' | 'junior_secondary' | 'senior_secondary';
      if (!name || !code) return NextResponse.json({ error: 'Class name and code are required.' }, { status: 400 });
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_subject') {
      if (!isAdmin) return forbiddenResponse();
      const name = String(p.name || '').trim();
      const code = String(p.code || '').trim().toUpperCase();
      const departmentId = String(p.departmentId || '');
      const levelGroup = String(p.levelGroup || 'senior_secondary') as 'primary' | 'junior_secondary' | 'senior_secondary';
      const applicableClassIds = (p.applicableClassIds as string[]) || [];
      if (!name || !code || !departmentId) {
        return NextResponse.json({ error: 'Subject name, code, and department are required.' }, { status: 400 });
      }
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'create_session' || action === 'set_current_session_term') {
      if (!isAdmin) return forbiddenResponse();
      if (action === 'create_session') {
        const name = String(p.name || '').trim();
        const startDate = String(p.startDate || '');
        const endDate = String(p.endDate || '');
        if (!name || !startDate || !endDate) {
          return NextResponse.json({ error: 'Session name, start date, and end date are required.' }, { status: 400 });
        }
        await mutateDb((db) => {
          const sessId = newId('sess');
          const now = new Date().toISOString();
          db.sessions.push({ id: sessId, name, startDate, endDate, isCurrent: false, createdAt: now });
          db.terms.push(
            { id: newId('term'), sessionId: sessId, name: 'First Term', startDate, endDate, isCurrent: false, createdAt: now },
            { id: newId('term'), sessionId: sessId, name: 'Second Term', startDate, endDate, isCurrent: false, createdAt: now },
            { id: newId('term'), sessionId: sessId, name: 'Third Term', startDate, endDate, isCurrent: false, createdAt: now }
          );
          appendAuditLog(db, me, 'SESSION_CREATED', 'academic_session', sessId, `Created ${name} with 3 terms.`);
        });
        return NextResponse.json({ ok: true });
      } else {
        const sessionId = String(p.sessionId || '');
        const termId = String(p.termId || '');
        await mutateDb((db) => {
          if (sessionId) {
            for (const s of db.sessions) s.isCurrent = s.id === sessionId;
          }
          if (termId) {
            for (const t of db.terms) t.isCurrent = t.id === termId;
          }
          appendAuditLog(db, me, 'ACTIVE_PERIOD_CHANGED', 'academic_term', termId || sessionId, 'Updated active academic session/term.');
        });
        return NextResponse.json({ ok: true });
      }
    }

    if (action === 'update_settings') {
      if (!isAdmin) return forbiddenResponse();
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'broadcast_announcement') {
      const title = String(p.title || '').trim();
      const message = String(p.message || '').trim();
      const targetRole = String(p.targetRole || 'all');
      if (!title || !message) {
        return NextResponse.json({ error: 'Announcement title and message are required.' }, { status: 400 });
      }
      await mutateDb((db) => {
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
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: `Unsupported admin action: ${action}` }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid administrative request payload.' }, { status: 400 });
  }
}
