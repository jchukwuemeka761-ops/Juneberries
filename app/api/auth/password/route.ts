import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { authenticateRequest } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId } from '@/lib/server/db';
import { hashPassword, verifyPassword } from '@/lib/server/security';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      action: 'change_password' | 'request_reset' | 'confirm_reset';
      currentPassword?: string;
      newPassword?: string;
      email?: string;
      resetCode?: string;
    };

    if (body.action === 'change_password') {
      const auth = await authenticateRequest(req);
      if (!auth) {
        return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
      }
      if (!body.currentPassword || !body.newPassword || body.newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Current password and a new password (min 8 chars) are required.' },
          { status: 400 }
        );
      }
      const res = await mutateDb((db) => {
        const prof = db.profiles.find((p) => p.id === auth.profile.id);
        if (!prof || !verifyPassword(body.currentPassword!, prof.passwordHash)) {
          return { error: 'Current password is incorrect.', status: 400 as const };
        }
        prof.passwordHash = hashPassword(body.newPassword!);
        prof.mustChangePassword = false;
        prof.updatedAt = new Date().toISOString();
        appendAuditLog(
          db,
          { id: prof.id, fullName: prof.fullName, role: prof.role },
          'PASSWORD_CHANGED',
          'profile',
          prof.id,
          'User updated their account password.'
        );
        return { status: 200 as const };
      });
      if ('error' in res) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ message: 'Password updated successfully.' });
    }

    if (body.action === 'request_reset') {
      const email = body.email?.trim().toLowerCase() || '';
      if (!email) {
        return NextResponse.json({ error: 'Account email is required.' }, { status: 400 });
      }
      await mutateDb((db) => {
        const prof = db.profiles.find((p) => p.email.toLowerCase() === email);
        if (!prof) return;
        const code = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
        db.passwordResetTokens.push({
          id: newId('prt'),
          profileId: prof.id,
          token: code,
          expiresAt,
          used: false,
        });
        for (const admin of db.profiles.filter((p) => p.role === 'super_admin')) {
          db.notifications.unshift({
            id: newId('notif'),
            recipientProfileId: admin.id,
            title: 'Password Reset Requested',
            message: `${prof.fullName} (${prof.email}) requested a password reset. Verification code: ${code}`,
            category: 'account',
            isRead: false,
            createdAt: new Date().toISOString(),
          });
        }
      });
      return NextResponse.json({
        message:
          'If an account matches that email, a reset request has been logged for verification with your school administrator.',
      });
    }

    if (body.action === 'confirm_reset') {
      const email = body.email?.trim().toLowerCase() || '';
      const resetCode = body.resetCode?.trim() || '';
      const newPassword = body.newPassword || '';
      if (!email || !resetCode || newPassword.length < 8) {
        return NextResponse.json(
          { error: 'Email, 6-digit verification code, and new password (min 8 chars) are required.' },
          { status: 400 }
        );
      }
      const res = await mutateDb((db) => {
        const prof = db.profiles.find((p) => p.email.toLowerCase() === email);
        if (!prof) {
          return { error: 'Invalid email or reset code.', status: 400 as const };
        }
        const tokenRec = db.passwordResetTokens.find(
          (t) =>
            t.profileId === prof.id &&
            t.token === resetCode &&
            !t.used &&
            new Date(t.expiresAt).getTime() > Date.now()
        );
        if (!tokenRec) {
          return { error: 'Reset code is invalid or expired.', status: 400 as const };
        }
        tokenRec.used = true;
        prof.passwordHash = hashPassword(newPassword);
        prof.updatedAt = new Date().toISOString();
        appendAuditLog(
          db,
          { id: prof.id, fullName: prof.fullName, role: prof.role },
          'PASSWORD_RESET_COMPLETED',
          'profile',
          prof.id,
          'Password reset verified with one-time code.'
        );
        return { status: 200 as const };
      });
      if ('error' in res) {
        return NextResponse.json({ error: res.error }, { status: res.status });
      }
      return NextResponse.json({ message: 'Password reset completed. You may now sign in.' });
    }

    return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid password request.' }, { status: 400 });
  }
}
