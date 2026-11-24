import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, toPublicProfile } from '@/lib/server/db';
import { signSessionToken, verifyPassword } from '@/lib/server/security';
import { type PortalScope, validatePortalRoleAccess } from '@/lib/portal-routing';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      identifier?: string;
      password?: string;
      portalScope?: PortalScope;
    };

    const identifier = body.identifier?.trim().toLowerCase() || '';
    const password = body.password || '';
    const portalScope = body.portalScope;

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email, Admission Number, or Staff ID and password are required.' },
        { status: 400 }
      );
    }

    const authResult = await mutateDb((db) => {
      // Allow lookup by email, student admission number, or staff number
      let profile = db.profiles.find((p) => p.email.toLowerCase() === identifier);

      if (!profile) {
        const studentMatch = db.students.find(
          (s) => s.admissionNumber.toLowerCase() === identifier
        );
        if (studentMatch) {
          profile = db.profiles.find((p) => p.id === studentMatch.profileId);
        }
      }

      if (!profile) {
        const staffMatch = db.staff.find(
          (st) => st.staffNumber.toLowerCase() === identifier
        );
        if (staffMatch) {
          profile = db.profiles.find((p) => p.id === staffMatch.profileId);
        }
      }

      if (!profile || !verifyPassword(password, profile.passwordHash)) {
        return { error: 'Invalid login credentials.', status: 401 as const };
      }

      const scopeCheck = validatePortalRoleAccess(profile.role, portalScope);
      if (!scopeCheck.allowed) {
        return {
          error: scopeCheck.error || 'Please use the portal designated for your role.',
          status: 403 as const,
        };
      }

      if (profile.role === 'student') {
        const stu = db.students.find((s) => s.profileId === profile!.id);
        if (stu && stu.accountStatus === 'pending_activation') {
          return {
            error:
              'Your student account is awaiting administrator verification and activation.',
            status: 403 as const,
          };
        }
        if (stu && stu.accountStatus === 'withdrawn') {
          return {
            error: 'This student account has been deactivated.',
            status: 403 as const,
          };
        }
      }

      if (!profile.isActive) {
        return {
          error: 'Account is currently deactivated. Contact school administration.',
          status: 403 as const,
        };
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

      const studentRecord = db.students.find((s) => s.profileId === profile!.id) || null;
      const staffRecord = db.staff.find((s) => s.profileId === profile!.id) || null;

      return {
        status: 200 as const,
        token,
        profile: toPublicProfile(profile),
        studentRecord,
        staffRecord,
      };
    });

    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const res = NextResponse.json({
      token: authResult.token,
      profile: authResult.profile,
      studentRecord: authResult.studentRecord,
      staffRecord: authResult.staffRecord,
    });
    attachSessionCookie(req, res, authResult.token);
    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid login request.' }, { status: 400 });
  }
}
