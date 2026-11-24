import { NextRequest, NextResponse } from 'next/server';
import type { Profile, UserRole } from '../types';
import { ensureSessionSecret, readDb } from './db';
import { verifySessionToken } from './security';

export const SESSION_COOKIE_NAME = 'jb_session';

export interface AuthContext {
  profile: Profile;
}

export async function authenticateRequest(
  req: NextRequest
): Promise<AuthContext | null> {
  let token = '';
  const header = req.headers.get('authorization');
  if (header && header.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else {
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value?.trim() || '';
  }

  if (!token) return null;
  await ensureSessionSecret();
  const payload = verifySessionToken(token);
  if (!payload) return null;

  const profile = await readDb((db) =>
    db.profiles.find((p) => p.id === payload.sub && p.isActive)
  );
  if (!profile) return null;
  return { profile };
}

export function attachSessionCookie(
  req: NextRequest,
  res: NextResponse,
  token: string
): void {
  const isHttps =
    req.nextUrl.protocol === 'https:' ||
    req.headers.get('x-forwarded-proto') === 'https';

  res.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: '/',
    maxAge: 60 * 60 * 12,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    ...(isHttps ? { partitioned: true } : {}),
  });
}

export function unauthorizedResponse(message = 'Authentication required.') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenResponse(
  message = 'You do not have permission to perform this action.'
) {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function requireRole(
  req: NextRequest,
  allowedRoles: UserRole[]
): Promise<{ auth: AuthContext } | { error: NextResponse }> {
  const auth = await authenticateRequest(req);
  if (!auth) {
    return { error: unauthorizedResponse() };
  }
  if (!allowedRoles.includes(auth.profile.role)) {
    return { error: forbiddenResponse() };
  }
  return { auth };
}
