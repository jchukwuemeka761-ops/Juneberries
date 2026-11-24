import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { AuditLog, PublicProfile, Profile, SchoolDatabase, UserRole } from '../types';
import { createInitialEmptyDb } from './seed';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'juneberry-db.json');

const globalForDb = globalThis as unknown as {
  __juneberryDbCache?: SchoolDatabase;
  __juneberryDbLock?: Promise<void>;
};

async function ensureDbLoaded(): Promise<SchoolDatabase> {
  if (globalForDb.__juneberryDbCache) {
    return globalForDb.__juneberryDbCache;
  }
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as SchoolDatabase;
    globalForDb.__juneberryDbCache = parsed;
    return parsed;
  } catch {
    const initial = createInitialEmptyDb();
    await persistDb(initial);
    globalForDb.__juneberryDbCache = initial;
    return initial;
  }
}

async function persistDb(db: SchoolDatabase): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpFile, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tmpFile, DB_FILE);
}

export async function readDb<T>(reader: (db: SchoolDatabase) => T): Promise<T> {
  const pending = globalForDb.__juneberryDbLock ?? Promise.resolve();
  await pending;
  const db = await ensureDbLoaded();
  return reader(db);
}

export async function mutateDb<T>(
  mutator: (db: SchoolDatabase) => T | Promise<T>
): Promise<T> {
  const prev = globalForDb.__juneberryDbLock ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalForDb.__juneberryDbLock = prev.then(() => next);

  await prev;
  try {
    const db = await ensureDbLoaded();
    const result = await mutator(db);
    await persistDb(db);
    globalForDb.__juneberryDbCache = db;
    return result;
  } finally {
    release();
  }
}

export function toPublicProfile(profile: Profile): PublicProfile {
  const { passwordHash: _omit, ...rest } = profile;
  void _omit;
  return rest;
}

export function appendAuditLog(
  db: SchoolDatabase,
  actor: { id: string; fullName: string; role: UserRole },
  action: string,
  entityType: string,
  entityId: string,
  details: string
): AuditLog {
  const entry: AuditLog = {
    id: `aud_${crypto.randomUUID().slice(0, 8)}`,
    actorProfileId: actor.id,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    details,
    createdAt: new Date().toISOString(),
  };
  db.auditLogs.unshift(entry);
  if (db.auditLogs.length > 500) {
    db.auditLogs = db.auditLogs.slice(0, 500);
  }
  return entry;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 10)}`;
}
