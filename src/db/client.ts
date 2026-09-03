import { attachDatabasePool } from "@vercel/functions";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { requireEnv } from "@/lib/env";

import * as schema from "./schema";

/**
 * node-postgres over Neon's pooled endpoint.
 *
 * Deliberately NOT the `@neondatabase/serverless` HTTP driver. That driver does
 * one-shot queries only — no transactions and no session state — and `withOrg()`
 * below depends on `SET LOCAL`, which needs a real transaction. Neon's own
 * guidance for Vercel is node-postgres with Fluid compute, which is what this is.
 *
 * Schema migrations use DATABASE_URL_UNPOOLED instead (see drizzle.config.ts):
 * DDL and session-scoped settings must not go through the pooler.
 */
const connectionString = requireEnv(
  "DATABASE_URL",
  "Copy .env.example to .env.local and fill it in.",
);

const globalForDb = globalThis as unknown as { __gsPool?: Pool };

const pool =
  globalForDb.__gsPool ??
  new Pool({
    connectionString,
    // Neon's pooler already fans out; keep per-instance connections modest so a
    // burst of serverless invocations cannot exhaust the project's limit.
    max: 10,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForDb.__gsPool = pool;

// Lets Vercel Fluid compute drain the pool cleanly between invocations.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;

/**
 * Run work inside a transaction with the org identity pinned for RLS.
 *
 * `SET LOCAL` scopes the setting to this transaction, so the value cannot leak
 * into the next request that borrows the same pooled connection. Every
 * org-scoped read and write must go through here — that is what makes a
 * forgotten `where orgId = …` fail closed instead of leaking across orgs (§8).
 */
export async function withOrg<T>(orgId: string, fn: (tx: Parameters<Parameters<Db["transaction"]>[0]>[0]) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
