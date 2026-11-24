import { NextRequest, NextResponse } from 'next/server';
import { attachSessionCookie } from '@/lib/server/auth';
import { appendAuditLog, mutateDb, newId, toPublicProfile } from '@/lib/server/db';
import { hashPassword, signSessionToken } from '@/lib/server/security';
import { applySampleSchoolSeed } from '@/lib/server/seed';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      fullName?: string;
      email?: string;
      password?: string;
      bootstrapPasscode?: string;
      seedSampleData?: boolean;
      sampleAccountPassword?: string;
    };

    const fullName = body.fullName?.trim() || '';
    const email = body.email?.trim().toLowerCase() || '';
    const password = body.password || '';
    const seedSampleData = Boolean(body.seedSampleData);
    const sampleAccountPassword = body.sampleAccountPassword || password;

    if (!fullName || !email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid administrator full name and email address are required.' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Administrator password must be at least 8 characters.' },
        { status: 400 }
      );
    }

    const requiredPasscode = process.env.ADMIN_BOOTSTRAP_PASSCODE?.trim();
    if (requiredPasscode && body.bootstrapPasscode !== requiredPasscode) {
      return NextResponse.json(
        { error: 'Invalid server bootstrap passcode.' },
        { status: 403 }
      );
    }

    const result = await mutateDb((db) => {
      if (db.initialized) {
        return { conflict: true as const };
      }

      const now = new Date().toISOString();
      const adminProfileId = newId('prof_admin');
      const adminProfile = {
        id: adminProfileId,
        email,
        fullName,
        role: 'super_admin' as const,
        isActive: true,
        passwordHash: hashPassword(password),
        createdAt: now,
        updatedAt: now,
      };
      db.profiles.push(adminProfile);
      const adminStaffNo = db.staff.some((s) => s.staffNumber === 'JBS/STF/001')
        ? `JBS/ADM/${Math.floor(100 + Math.random() * 900)}`
        : 'JBS/STF/001';
      db.staff.push({
        id: newId('staff_admin'),
        profileId: adminProfileId,
        staffNumber: adminStaffNo,
        designation: 'General Administrator',
        isSampleData: false,
        createdAt: now,
      });

      if (seedSampleData) {
        applySampleSchoolSeed(db, sampleAccountPassword, adminProfileId);
      }

      db.initialized = true;
      appendAuditLog(
        db,
        { id: adminProfile.id, fullName: adminProfile.fullName, role: adminProfile.role },
        'ADMIN_BOOTSTRAP_CLAIMED',
        'profile',
        adminProfile.id,
        `Super Administrator account provisioned for ${adminProfile.email}.`
      );

      const token = signSessionToken({
        sub: adminProfile.id,
        role: adminProfile.role,
        email: adminProfile.email,
      });

      return {
        conflict: false as const,
        token,
        profile: toPublicProfile(adminProfile),
      };
    });

    if (result.conflict) {
      return NextResponse.json(
        { error: 'Initial administrator setup has already been completed and locked.' },
        { status: 409 }
      );
    }

    const res = NextResponse.json({
      token: result.token,
      profile: result.profile,
    });
    attachSessionCookie(req, res, result.token);
    return res;
  } catch {
    return NextResponse.json({ error: 'Invalid setup request payload.' }, { status: 400 });
  }
}
