import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/server/auth';
import { readDb } from '@/lib/server/db';

export async function GET(req: NextRequest) {
  const auth = await authenticateRequest(req);
  const info = await readDb((db) => ({
    initialized: db.initialized,
    authenticated: Boolean(auth),
    requiresBootstrapPasscode: Boolean(process.env.ADMIN_BOOTSTRAP_PASSCODE?.trim()),
    schoolName: db.settings.schoolName,
    motto: db.settings.motto,
    address: db.settings.address,
    email: db.settings.email,
    phone: db.settings.phone,
    logoUrl: db.settings.logoUrl,
    allowStudentSelfRegistration: db.settings.allowStudentSelfRegistration,
    requireAdminApprovalForStudents: db.settings.requireAdminApprovalForStudents,
    classes: db.classes
      .filter((c) => c.isActive)
      .sort((a, b) => a.levelOrder - b.levelOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        levelGroup: c.levelGroup,
      })),
    departments: db.departments
      .filter((d) => d.isActive)
      .map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
      })),
    subjects: db.subjects
      .filter((s) => s.isActive)
      .map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        departmentId: s.departmentId,
        levelGroup: s.levelGroup,
        applicableClassIds: s.applicableClassIds,
      })),
    sampleEnabled: db.students.some((s) => s.isSampleData),
  }));
  return NextResponse.json(info);
}
