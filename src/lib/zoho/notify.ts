import { inngest, ZOHO_CREATE_EVENT, ZOHO_PUSH_EVENT } from "@/inngest/client";

/**
 * Queues a Zoho push for one card.
 *
 * **Never throws.** A queue that is unreachable must not fail the operator's
 * mutation — the card is saved either way, and the next "Push now" or reconcile
 * picks it up. Losing the sync is recoverable; losing the edit is not.
 *
 * Call this AFTER the transaction commits. A worker that reads before the
 * commit lands sees the old row and pushes stale values.
 */
export async function queueZohoPush(
  orgId: string,
  opportunityId: string,
  kind: "created" | "changed",
): Promise<void> {
  try {
    await inngest.send({
      name: kind === "created" ? ZOHO_CREATE_EVENT : ZOHO_PUSH_EVENT,
      data: { orgId, opportunityId },
    });
  } catch (err) {
    console.error(`[zoho] could not queue a push for ${opportunityId}:`, (err as Error).message);
  }
}
