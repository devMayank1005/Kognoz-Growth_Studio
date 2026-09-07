import { inngest, ZOHO_CREATE_EVENT, ZOHO_PUSH_EVENT, ZOHO_SYNC_ALL_EVENT } from "./client";

/**
 * The Zoho push (PRD §6, §12 #6).
 *
 * Two functions over ONE implementation (`src/lib/zoho/push.ts`), so the create
 * path and the update path cannot drift apart in what they write.
 */

interface CardEvent { data: { orgId: string; opportunityId: string } }

/**
 * A card was just added.
 *
 * **No debounce**, deliberately. An add is a single discrete event with nothing
 * to coalesce, and §12 #6 allows ten seconds from add to synced — spending five
 * of them waiting for edits that are not coming would be a third of the budget
 * for no benefit.
 */
export const zohoCreateCard = inngest.createFunction(
  {
    id: "zoho-create-card",
    retries: 3,
    // Per card, so one slow push cannot block another's.
    concurrency: [{ limit: 1, key: "event.data.opportunityId" }],
    triggers: [{ event: ZOHO_CREATE_EVENT }],
  },
  async ({ event, step }: { event: CardEvent; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    return step.run("push", async () => {
      const { pushCard } = await import("@/lib/zoho/push");
      const r = await pushCard(event.data.orgId, event.data.opportunityId);
      console.log(`[zoho] create ${r.account}: ${r.status}${r.reason ? ` — ${r.reason}` : ""}`);
      return r;
    });
  },
);

/**
 * A card changed.
 *
 * `debounce` keyed PER CARD (PRD §6's 5s): a burst of edits to one card
 * collapses into one push, and never resets another card's timer. `timeout`
 * caps the total wait so a card being edited continuously still flushes.
 */
export const zohoPushCard = inngest.createFunction(
  {
    id: "zoho-push-card",
    retries: 3,
    debounce: { period: "5s", key: "event.data.opportunityId", timeout: "60s" },
    concurrency: [{ limit: 1, key: "event.data.opportunityId" }],
    triggers: [{ event: ZOHO_PUSH_EVENT }],
  },
  async ({ event, step }: { event: CardEvent; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    return step.run("push", async () => {
      const { pushCard } = await import("@/lib/zoho/push");
      const r = await pushCard(event.data.orgId, event.data.opportunityId);
      console.log(`[zoho] push ${r.account}: ${r.status}${r.reason ? ` — ${r.reason}` : ""}`);
      return r;
    });
  },
);

/**
 * "Push now" — everything currently pending.
 *
 * `singleton` so hammering the button cannot launch overlapping runs, the
 * lesson already written into `dailySweep`'s comment about ⌘K. One `step.run`
 * per card, so a card that fails does not lose the ones already pushed.
 */
export const zohoSyncAll = inngest.createFunction(
  {
    id: "zoho-sync-all",
    retries: 1,
    concurrency: { limit: 1 },
    debounce: { period: "10s" },
    triggers: [{ event: ZOHO_SYNC_ALL_EVENT }],
  },
  async ({ event, step }: {
    event: { data: { orgId: string } };
    step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> };
  }) => {
    const orgId = event.data.orgId;

    const ids = await step.run("pending", async () => {
      const { loadPipeline } = await import("@/db/queries");
      const { isPending } = await import("@/domain/zoho/status");
      const cards = await loadPipeline(orgId);
      return cards
        .filter((c) => !["Won", "Lost"].includes(c.stage))
        .filter((c) => isPending({ updatedAt: c.updatedAt, zohoSyncedAt: c.zohoSyncedAt }))
        .map((c) => c.id);
    });

    const results: string[] = [];
    for (const id of ids) {
      // One step per card: a failure on the seventh keeps the first six.
      const r = await step.run(`push-${id}`, async () => {
        const { pushCard } = await import("@/lib/zoho/push");
        return pushCard(orgId, id);
      });
      results.push(`${r.account}=${r.status}`);
    }

    console.log(`[zoho] sync-all ${ids.length} card(s): ${results.join(", ") || "none pending"}`);
    return { pushed: ids.length, results };
  },
);
