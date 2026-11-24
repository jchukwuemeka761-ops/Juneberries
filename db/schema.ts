import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Portal data is stored one row per collection (profiles, questions, attempts, ...).
 * Each row carries a revision counter so server instances can cheaply detect
 * which collections changed and only re-fetch those.
 */
export const portalCollections = pgTable('portal_collections', {
  key: text().primaryKey(),
  data: jsonb().notNull(),
  revision: bigint({ mode: 'number' }).notNull().default(1),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
