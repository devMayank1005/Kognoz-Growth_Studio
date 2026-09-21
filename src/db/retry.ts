/**
 * One retry, for connection failures only.
 *
 * The database sits in `us-east-2` and the operators are in India, so a dropped
 * socket is a normal event rather than a bug — and a single dropped socket used
 * to render a 500 on whatever page happened to be loading. When the connection
 * died, the query provably never ran, so retrying it is safe.
 *
 * Deliberately narrow:
 *   - ONE retry, not a loop. If the second attempt fails, the operator sees the
 *     error page and can retry themselves.
 *   - Connection-class failures ONLY. `57014` (statement timeout) means the
 *     query DID run, so retrying could do the work twice.
 *   - Reads only. `provisionMembership` inserts a member row and an audit row
 *     with no unique guard, so a blind retry there would double-provision.
 */

/** Socket-level and Postgres connection-class codes. */
const TRANSIENT = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  // Class 08 — connection exception. 57P01 — admin shutdown.
  "08000",
  "08001",
  "08003",
  "08006",
  "57P01",
]);

/**
 * True when this error means "the connection failed", looking through the layers
 * that wrap it: drizzle's `DrizzleQueryError` sets `cause`, and Node's Happy
 * Eyeballs produces an `AggregateError` holding one error per resolved address —
 * which is precisely what the production log contained.
 */
export function isTransientConnectionError(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 5) return false;

  const e = err as { code?: unknown; cause?: unknown; errors?: unknown };

  if (typeof e.code === "string" && TRANSIENT.has(e.code)) return true;

  // Guard the array check: an AggregateError with a non-array `errors` is what
  // crashed Next's error inspector, so never assume it is iterable.
  if (Array.isArray(e.errors)) {
    for (const sub of e.errors) if (isTransientConnectionError(sub, depth + 1)) return true;
  }

  if (e.cause && e.cause !== err) return isTransientConnectionError(e.cause, depth + 1);
  return false;
}

/**
 * True when this error is a unique-constraint violation (SQLSTATE 23505).
 *
 * Walks the same layers as `isTransientConnectionError` above, for the same
 * reason: drizzle wraps the driver error in `cause`.
 *
 * Used where a unique index is the authority rather than a pre-check — `addCard`
 * asks the partial index `opportunities_one_live_per_account_uidx` whether a live
 * card already exists, instead of trusting a SELECT that another request can
 * invalidate between the read and the write.
 */
export function isUniqueViolation(err: unknown, depth = 0): boolean {
  if (!err || typeof err !== "object" || depth > 5) return false;

  const e = err as { code?: unknown; cause?: unknown; errors?: unknown };
  if (e.code === "23505") return true;

  if (Array.isArray(e.errors)) {
    for (const sub of e.errors) if (isUniqueViolation(sub, depth + 1)) return true;
  }

  if (e.cause && e.cause !== err) return isUniqueViolation(e.cause, depth + 1);
  return false;
}

/** Runs `fn`, retrying exactly once if it failed because the connection died. */
export async function retryOnConnectionError<T>(
  fn: () => Promise<T>,
  delayMs = 250,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isTransientConnectionError(err)) throw err;

    console.warn("[db] connection failed, retrying once");
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fn();
  }
}
