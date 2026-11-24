import crypto from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db as pg } from '@/db';
import { portalCollections } from '@/db/schema';
import type { AuditLog, PublicProfile, Profile, SchoolDatabase, UserRole } from '../types';
import { createInitialEmptyDb } from './seed';
import { hasSessionSecretFromEnv, setSessionSecret } from './security';

/**
 * Persistent storage backed by Netlify Database (Postgres).
 *
 * The school database is stored as one jsonb row per collection. Each server
 * instance keeps an in-memory copy and, on every read, checks the (tiny) list of
 * collection revisions so only collections that changed elsewhere are re-fetched.
 * Writes run in a transaction guarded by an advisory lock so concurrent
 * requests across instances never overwrite each other.
 */

type Executor = Pick<typeof pg, 'select' | 'insert' | 'update' | 'execute'>;

interface CachedCollection {
  revision: number;
  data: unknown;
  serialized: string;
}

const MUTATION_LOCK_ID = 7_301_552;

const SESSION_SECRET_KEY = '__session_secret';

const globalForDb = globalThis as unknown as {
  __juneberryCollections?: Map<string, CachedCollection>;
  __juneberryLoad?: Promise<SchoolDatabase>;
  __juneberrySecretReady?: Promise<void>;
};

/**
 * Ensures every instance signs sessions with the same secret. Uses SESSION_SECRET
 * when configured; otherwise a random secret is generated once and stored in the
 * database so all instances share it.
 */
export function ensureSessionSecret(): Promise<void> {
  if (hasSessionSecretFromEnv()) return Promise.resolve();
  if (!globalForDb.__juneberrySecretReady) {
    globalForDb.__juneberrySecretReady = (async () => {
      await pg
        .insert(portalCollections)
        .values({ key: SESSION_SECRET_KEY, data: crypto.randomBytes(32).toString('hex') })
        .onConflictDoNothing();
      const [row] = await pg
        .select({ data: portalCollections.data })
        .from(portalCollections)
        .where(eq(portalCollections.key, SESSION_SECRET_KEY));
      setSessionSecret(String(row.data));
    })().catch((err) => {
      globalForDb.__juneberrySecretReady = undefined;
      throw err;
    });
  }
  return globalForDb.__juneberrySecretReady;
}

function cache(): Map<string, CachedCollection> {
  if (!globalForDb.__juneberryCollections) {
    globalForDb.__juneberryCollections = new Map();
  }
  return globalForDb.__juneberryCollections;
}

let defaultsCache: Record<string, unknown> | undefined;

function assemble(): SchoolDatabase {
  defaultsCache ??= createInitialEmptyDb() as unknown as Record<string, unknown>;
  const defaults = defaultsCache;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(defaults)) {
    const cached = cache().get(key);
    out[key] = cached ? cached.data : defaults[key];
  }
  return out as unknown as SchoolDatabase;
}

async function seedIfEmpty(tx: Executor): Promise<void> {
  const initial = createInitialEmptyDb() as unknown as Record<string, unknown>;
  await tx
    .insert(portalCollections)
    .values(Object.entries(initial).map(([key, data]) => ({ key, data })))
    .onConflictDoNothing();
}

async function syncFromDatabase(tx: Executor): Promise<SchoolDatabase> {
  let revisions = await tx
    .select({ key: portalCollections.key, revision: portalCollections.revision })
    .from(portalCollections);

  if (!revisions.some((r) => r.key === 'settings')) {
    await seedIfEmpty(tx);
    revisions = await tx
      .select({ key: portalCollections.key, revision: portalCollections.revision })
      .from(portalCollections);
  }

  const stale = revisions
    .filter((r) => r.key !== SESSION_SECRET_KEY)
    .filter((r) => cache().get(r.key)?.revision !== r.revision)
    .map((r) => r.key);

  if (stale.length > 0) {
    const rows = await tx
      .select()
      .from(portalCollections)
      .where(inArray(portalCollections.key, stale));
    for (const row of rows) {
      cache().set(row.key, {
          revision: row.revision,
        data: row.data,
        serialized: JSON.stringify(row.data),
      });
    }
  }
  return assemble();
}

async function loadShared(): Promise<SchoolDatabase> {
  // Collapse concurrent reads within this instance into a single round trip.
  if (!globalForDb.__juneberryLoad) {
    globalForDb.__juneberryLoad = syncFromDatabase(pg).finally(() => {
      globalForDb.__juneberryLoad = undefined;
    });
  }
  return globalForDb.__juneberryLoad;
}

export async function readDb<T>(reader: (db: SchoolDatabase) => T): Promise<T> {
  const [db] = await Promise.all([loadShared(), ensureSessionSecret()]);
  return reader(db);
}

export async function mutateDb<T>(
  mutator: (db: SchoolDatabase) => T | Promise<T>
): Promise<T> {
  const committed: Array<{ key: string; entry: CachedCollection }> = [];
  await ensureSessionSecret();

  const result = await pg.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${MUTATION_LOCK_ID})`);
    await syncFromDatabase(tx);

    // Work on a deep copy so a failed mutation never corrupts the cache.
    const working = structuredClone(assemble()) as unknown as Record<string, unknown>;
    const value = await mutator(working as unknown as SchoolDatabase);

    for (const [key, data] of Object.entries(working)) {
      const serialized = JSON.stringify(data);
      const previous = cache().get(key);
      if (previous && previous.serialized === serialized) continue;

      const revision = (previous?.revision ?? 0) + 1;
      await tx
        .insert(portalCollections)
        .values({ key, data, revision, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: portalCollections.key,
          set: { data, revision, updatedAt: new Date() },
        });
      committed.push({ key, entry: { revision, data, serialized } });
    }
    return value;
  });

  for (const { key, entry } of committed) {
    cache().set(key, entry);
  }
  return result;
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
