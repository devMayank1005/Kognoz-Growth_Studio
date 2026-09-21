/**
 * Whether it is safe to create a record in someone else's CRM.
 *
 * `createRecord` has no duplicate check and no external id, and the local
 * `zoho_lead_id` is written in a SEPARATE transaction after the call returns.
 * Inngest delivers at least once with `retries: 3`, and `pushActionFor` derives
 * the action from the row every time — which is correct, and is exactly why this
 * failed: a retry that ran after the remote write but before the local one saw
 * `lead_id` still null, recomputed CREATE_LEAD, and created a second Lead. Up to
 * four per card, in a system of record we do not own and cannot roll back.
 *
 * So the intent is written down before the call and consulted after a crash. This
 * module is the decision; `src/db/zoho-attempts.ts` is the bookkeeping.
 *
 * The third answer is the point of the whole thing. "We called Zoho and never
 * learned the outcome" is not the same as "we did not call Zoho", and it is not
 * the same as "we created it". Guessing either way is how duplicates happen;
 * saying so lets a human look.
 */

export interface PushAttempt {
  /** The id Zoho returned, once we knew it. */
  remoteId: string | null;
  /** Set immediately before the HTTP call, so a crash is attributable. */
  sentAt: Date | null;
}

export type CreateDecision =
  /** No prior attempt under this key, or one that never reached Zoho. */
  | { action: "create" }
  /** A prior attempt created it and we have the id — use it, do not create again. */
  | { action: "adopt"; remoteId: string }
  /** A prior attempt called Zoho and the outcome was never recorded. */
  | { action: "unknown" };

export function decideCreate(attempt: PushAttempt | null): CreateDecision {
  if (!attempt) return { action: "create" };

  // Trusted over `sentAt`: if we have an id, the record exists whatever else the
  // row says.
  if (attempt.remoteId) return { action: "adopt", remoteId: attempt.remoteId };

  // Claimed but never sent — the crash happened before the network call, so
  // creating now cannot duplicate anything.
  if (!attempt.sentAt) return { action: "create" };

  return { action: "unknown" };
}

/**
 * The idempotency key for one logical push.
 *
 * `updatedAt` rather than a run id or a random token, because it needs no
 * plumbing through Inngest and it means the right thing: a retry of the same push
 * sees an unchanged row and so computes the same key, while a card the operator
 * has since edited is a genuinely new push and gets a new one.
 *
 * `updatedAt` is `defaultNow()` and hand-maintained rather than `$onUpdate`, so a
 * writer that forgets it produces a key that is stable for longer than it should
 * be. That direction is the safe one — it makes this guard more conservative, not
 * less.
 */
export function pushAttemptKey(opportunityId: string, updatedAt: Date | null | undefined): string {
  return `${opportunityId}:${updatedAt ? updatedAt.toISOString() : "unknown"}`;
}
