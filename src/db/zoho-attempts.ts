import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { zohoPushAttempts } from "@/db/schema";
import { decideCreate, type CreateDecision } from "@/domain/zoho/idempotency";

/**
 * The intent log behind `decideCreate` (src/domain/zoho/idempotency.ts).
 *
 * Bookkeeping only — the decision is pure and lives in the domain layer. Nothing
 * here selects an encrypted column, so it is not subject to the rule in
 * src/db/zoho.ts about which module may read tokens.
 */

export type ZohoModule = "Leads" | "Deals";

function wherePush(opportunityId: string, module: ZohoModule, key: string) {
  return and(
    eq(zohoPushAttempts.opportunityId, opportunityId),
    eq(zohoPushAttempts.module, module),
    eq(zohoPushAttempts.key, key),
  );
}

/**
 * Claims the right to create, or reports what an earlier attempt already did.
 *
 * The unique index is the mechanism, not the select: `onConflictDoNothing` plus
 * `returning` means the first execution gets a row back and the second gets
 * nothing, and the second then reads what the first recorded. A plain
 * select-then-insert here would have the very race it exists to prevent.
 */
export async function claimCreate(
  orgId: string,
  opportunityId: string,
  module: ZohoModule,
  key: string,
): Promise<CreateDecision> {
  const inserted = await db
    .insert(zohoPushAttempts)
    .values({ orgId, opportunityId, module, key })
    .onConflictDoNothing({
      target: [zohoPushAttempts.opportunityId, zohoPushAttempts.module, zohoPushAttempts.key],
    })
    .returning({ id: zohoPushAttempts.id });

  // We wrote the claim, so nothing has called Zoho under this key.
  if (inserted[0]) return { action: "create" };

  const [existing] = await db
    .select({ remoteId: zohoPushAttempts.remoteId, sentAt: zohoPushAttempts.sentAt })
    .from(zohoPushAttempts)
    .where(wherePush(opportunityId, module, key))
    .limit(1);

  return decideCreate(existing ?? null);
}

/**
 * Stamped immediately before the HTTP call.
 *
 * This is what makes a crash attributable: with `sent_at` set and `remote_id`
 * null, we know a request went out and we do not know what came back — which is
 * a different answer from "we never called", and the only one that must not be
 * guessed.
 */
export async function markCreateSent(
  opportunityId: string,
  module: ZohoModule,
  key: string,
): Promise<void> {
  await db
    .update(zohoPushAttempts)
    .set({ sentAt: new Date() })
    .where(wherePush(opportunityId, module, key));
}

/** The id Zoho returned. After this, a retry adopts rather than creates. */
export async function recordCreateResult(
  opportunityId: string,
  module: ZohoModule,
  key: string,
  remoteId: string,
): Promise<void> {
  await db
    .update(zohoPushAttempts)
    .set({ remoteId })
    .where(wherePush(opportunityId, module, key));
}
