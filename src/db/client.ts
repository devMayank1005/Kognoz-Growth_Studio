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

    /**
     * Every wait here is bounded on purpose.
     *
     * Without `connectionTimeoutMillis`, pg-pool queues a connection request
     * with NO timer at all and waits forever for a peer to release, and a fresh
     * TCP connect is capped only by the kernel's SYN retry budget (~127s). That
     * is what produced 49s and 78s page loads.
     *
     * 30s, not 10s. I tried 10s first and it turned "slow" into "broken": a cold
     * pool from India establishes each connection in 1.7-4.8s, the studio layout
     * asks for four at once, and waiters exceeded the budget and rendered a 500
     * on /today and /pipeline. This bound exists to stop the pathological ~127s
     * kernel SYN timeout, not to fail a legitimately slow cold start.
     */
    connectionTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    query_timeout: 15_000,
    // withOrg() holds a transaction open across the caller's work, so an
    // abandoned one must not pin a connection indefinitely.
    idle_in_transaction_session_timeout: 15_000,

    /**
     * keepAlive defaults to FALSE in pg. On a long-haul path through NAT, with
     * Neon's pooler reaping its own idle connections, that is exactly how a
     * socket dies silently while sitting in the pool — which is the failure
     * that used to crash the process (see the error handler below).
     */
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,

    /**
     * 30s, deliberately — do NOT lower this.
     *
     * I once set it to 10s with `maxLifetimeSeconds: 300`, reasoning that
     * staying under Neon's pooler idle cutoff would avoid stale sockets. That
     * optimised for a rare failure and ignored the common case: any normal pause
     * while the operator reads the screen reaped the connection, so the next
     * click paid a full cold reconnect. Measured against the real database from
     * India, a query after a 12-second pause went from ~240ms to ~1800ms, and
     * the end-to-end suite went from 2.7 minutes to 17.
     *
     * `keepAlive` above is the right answer to a socket dying quietly; this knob
     * was solving a problem that already had a solution, at 8x the cost.
     */
    idleTimeoutMillis: 30_000,
  });

/**
 * The listener that keeps the process alive.
 *
 * `Pool extends EventEmitter`, and when an IDLE pooled client's socket dies
 * pg-pool calls `pool.emit("error", err, client)`. An `'error'` event with no
 * listener re-throws synchronously inside a libuv socket callback — there is no
 * request to attribute it to and no `try/catch` above it, so Node treats it as
 * an uncaughtException and exits.
 *
 * That is not a development annoyance: an uncaughtException terminates a Vercel
 * function instance, and under Fluid compute one instance serves concurrent
 * invocations, so a single dead idle connection killed every in-flight request
 * on it. A checked-out client's error rejects the caller's promise and is
 * recoverable; pg-pool re-attaches this idle listener on release, so the same
 * failure moments later was fatal instead.
 *
 * Logging it is the whole fix. The pool has already discarded the client.
 */
pool.on("error", (err) => {
  // Message and code only: pg attaches the whole Client to this error, and
  // logging that dumps the connection string's host and every setting on every
  // dropped socket.
  const code = (err as NodeJS.ErrnoException).code ?? "unknown";
  console.error(`[db] idle client dropped (${code}): ${err.message} — connection discarded, process alive`);
});

if (process.env.NODE_ENV !== "production") globalForDb.__gsPool = pool;

// Lets Vercel Fluid compute drain the pool cleanly between invocations.
attachDatabasePool(pool);

export const db = drizzle({ client: pool, schema });
export type Db = typeof db;

/**
 * The transaction handle `withOrg` hands to its callback.
 *
 * Named because several data-layer functions now accept `Db | Tx` so a caller can
 * pull them into an existing transaction — `deleteZohoConnection` and
 * `deleteConversation` both needed it once their audit row had to commit with
 * them.
 */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run work inside a transaction with the org identity pinned in `app.org_id`.
 *
 * NOTE: `drizzle/0018` DOES enable RLS and create policies that read this GUC —
 * seventeen of them, proven to deny by tests/integration/rls.test.ts. But
 * `DATABASE_URL` still connects as `neondb_owner`, which has `rolbypassrls`, so
 * they are not enforcing anything yet. Isolation still comes from the explicit
 * `orgId` filter in every query.
 *
 * Switching over needs the READ path inside a transaction first. This function
 * wraps writes only; `current_setting('app.org_id', true)` is NULL outside it and
 * `org_id = NULL` is never true, so pointing DATABASE_URL at the `growth_app` role
 * today would make every page render empty. The cost is three extra round trips
 * per read — about 700ms at the RTT this file measures — which is why
 * docs/CLAIM-NEON.md's ap-south-1 move is the thing that unblocks it.
 *
 * So: a real hook into real policies, one environment variable from being load
 * bearing. Do not describe it as two layers until that variable changes.
 *
 * `SET LOCAL` scopes the setting to this transaction, so the value cannot leak
 * into the next request that borrows the same pooled connection.
 *
 * Writes go through here; reads do NOT, and with no RLS policies there is
 * nothing to fail closed against — a forgotten `where orgId = …` would simply
 * return another org's rows. The explicit filter is the isolation.
 */
export async function withOrg<T>(orgId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${orgId}, true)`);
    return fn(tx);
  });
}
