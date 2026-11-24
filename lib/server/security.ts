import crypto from 'node:crypto';
import type { UserRole } from '../types';

const globalForSecret = globalThis as unknown as { __juneberrySessionSecret?: string };

/**
 * Installs a persistent signing secret (loaded from the database) so session
 * tokens stay valid across every server instance when SESSION_SECRET is unset.
 */
export function setSessionSecret(secret: string): void {
  globalForSecret.__juneberrySessionSecret = secret;
}

export function hasSessionSecretFromEnv(): boolean {
  return Boolean(process.env.SESSION_SECRET?.trim());
}

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  if (envSecret) return envSecret;
  if (!globalForSecret.__juneberrySessionSecret) {
    globalForSecret.__juneberrySessionSecret = crypto.randomBytes(32).toString('hex');
  }
  return globalForSecret.__juneberrySessionSecret;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  if (!salt || !keyHex) return false;
  const expectedBuffer = Buffer.from(keyHex, 'hex');
  const derivedBuffer = crypto.scryptSync(password, salt, 64);
  if (expectedBuffer.length !== derivedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, derivedBuffer);
}

export interface SessionPayload {
  sub: string;
  role: UserRole;
  email: string;
  exp: number;
}

export function signSessionToken(
  payload: Omit<SessionPayload, 'exp'>,
  ttlSeconds: number = 60 * 60 * 12
): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return null;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as SessionPayload;
    if (!parsed.sub || !parsed.role || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const trimmed = str.replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${trimmed}` : trimmed;
  if (safe.includes(',') || safe.includes('"')) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function isValidSafeUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('/images/') || url.startsWith('/uploads/') || url.startsWith('data:image/')) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
