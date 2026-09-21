import { and, eq, sql } from "drizzle-orm";

import { db, withOrg } from "@/db/client";
import { loadDnc, loadPipeline } from "@/db/queries";
import { activities, opportunities, settings, zohoConnections } from "@/db/schema";
import { isDoNotContact } from "@/domain/dnc";
import { classifyZohoError, describeZohoError, spendsStrike } from "@/domain/zoho/errors";
import { LEAD_SOURCE } from "@/domain/zoho/fields";
import { blockedReason, buildDeal, pushActionFor, toLead, type PushAction } from "@/domain/zoho/to-zoho";
import { currencyCodeOf } from "@/domain/zoho/currency";
import { loadMoneyView } from "@/lib/money-view";
import { claimCreate, markCreateSent, recordCreateResult, type ZohoModule } from "@/db/zoho-attempts";
import { pushAttemptKey } from "@/domain/zoho/idempotency";
import { redactSecrets } from "@/lib/redact";
import { toSyncCard } from "@/lib/zoho/card";
import { createRecord, updateRecord } from "@/lib/zoho/records";
import { getAccessToken } from "@/lib/zoho/token";

/**
 * Pushing one card into Zoho (PRD §6).
 *
 * The single implementation behind every path — the debounced update, the
 * create fired on add, and the "Push now" button — so those three cannot drift
 * apart in what they write.
 *
 * Order matters: load, then GUARD, then build, then send. Every guard runs
 * before a payload is even constructed, because the cheapest refusal is the one
 * that never reaches the network.
 */

export type PushStatus = "created" | "updated" | "blocked" | "failed" | "dry-run" | "skipped";

export interface PushResult {
  status: PushStatus;
  account: string;
  action: PushAction;
  /** What went, or would have gone. Never stored — §8. */
  summary?: string;
  reason?: string;
}

/** Only these two modules are ever written. Conversion arrives with Phase 4. */
const LEAD = "Leads";
const DEAL = "Deals";

export async function pushCard(orgId: string, opportunityId: string): Promise<PushResult> {
  const [row] = await db
    .select({
      leadId: opportunities.zohoLeadId,
      dealId: opportunities.zohoDealId,
      // Read fresh here, not from the React-cached `loadPipeline` below: it is
      // half of the idempotency key.
      updatedAt: opportunities.updatedAt,
    })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)))
    .limit(1);

  // `loadPipeline` is cached per request and already joins the account, the
  // partner and the verified person — the exact shape `toSyncCard` wants.
  const card = (await loadPipeline(orgId)).find((c) => c.id === opportunityId);
  if (!row || !card) return { status: "skipped", account: "unknown", action: "CREATE_LEAD", reason: "Card not found." };

  const sync = { ...toSyncCard(card), zohoLeadId: row.leadId, zohoDealId: row.dealId };
  const action = pushActionFor(sync);

  // ---------------------------------------------------------------- guards
  /**
   * DNC first, and before anything is built.
   *
   * §8 says the list blocks add, draft and packet. Pushing a do-not-contact
   * company into the client's CRM is precisely the outcome the list exists to
   * prevent — and this is the call site that covers a company added last month
   * and DNC'd today, which the add-time check cannot.
   */
  const dnc = await loadDnc(orgId);
  if (isDoNotContact(card.account, dnc)) {
    await block(orgId, opportunityId, "On the do-not-contact list (PRD §8).");
    return { status: "blocked", account: card.account, action, reason: "on the do-not-contact list" };
  }

  // Converting without a verified person would mint a Contact in the client's
  // live CRM named "(no named contact)".
  const noContact = blockedReason(action);
  if (noContact) {
    await block(orgId, opportunityId, noContact);
    return { status: "blocked", account: card.account, action, reason: noContact };
  }

  const [cfg] = await db
    .select({ dryRun: settings.zohoDryRun })
    .from(settings)
    .where(eq(settings.orgId, orgId))
    .limit(1);

  /**
   * The CRM's own currency — the thing `Amount` will be interpreted as.
   *
   * Read from the connection, NOT from `settings.baseCurrency`. Those are two
   * different facts: base is what Growth Studio stores (USD), this is what
   * Zoho reads (INR). Passing base as the target would make `convertAmount` a
   * no-op and send 300000 into a rupee CRM — a $300K deal landing as ₹300K,
   * which is the entire failure this conversion exists to prevent.
   */

  const money = await loadMoneyView(orgId);

  const [conn] = await db
    .select({ currency: zohoConnections.zohoCurrency })
    .from(zohoConnections)
    .where(eq(zohoConnections.orgId, orgId))
    .limit(1);

  /**
   * No fallback. This line used to read
   * `conn?.currency === "INR" ? "INR" : money.base`, which treated "I do not
   * recognise this string" as "it is the same currency as ours" — and the row
   * actually held `"Indian Rupee"`, so every Deal was priced in dollars and
   * sent unconverted to a rupee CRM. Refusing is the only safe answer: a card
   * that fails to sync is a visible problem, a deal sitting at 1/83rd of its
   * value is not.
   */
  const target = currencyCodeOf(conn?.currency);
  if (!target) {
    const reason = conn
      ? `Zoho's org currency (${conn.currency ?? "unset"}) is not one this can price. Reconnect Zoho in Settings.`
      : "Zoho is not connected.";
    await block(orgId, opportunityId, reason);
    return { status: "blocked", account: card.account, action, reason };
  }

  // ----------------------------------------------------------------- build
  const today = new Date();
  let zohoModule: string;
  let payload: Record<string, unknown>;

  if (action === "CREATE_LEAD" || action === "UPDATE_LEAD") {
    zohoModule = LEAD;
    // The Description carries a value; it must be in the currency the values
    // are actually stored in, not the dollars the helper used to assume.
    payload = toLead(sync, LEAD_SOURCE, money.base) as unknown as Record<string, unknown>;
  } else if (action === "CREATE_DEAL" || action === "UPDATE_DEAL") {
    zohoModule = DEAL;
    // The CRM is in rupees and the card is in dollars. `buildDeal` refuses
    // rather than pricing a deal at a rate nobody trusts.
    const deal = buildDeal(sync, {
      today,
      base: money.base,
      target,
      rate: money.rate,
    });
    if (!deal.ok) {
      await block(orgId, opportunityId, deal.message);
      return { status: "blocked", account: card.account, action, reason: deal.message };
    }
    payload = deal.payload as unknown as Record<string, unknown>;
  } else {
    // CONVERT and DEMOTED land in Phase 4. Skipped, not failed — there is
    // nothing wrong with the card.
    return { status: "skipped", account: card.account, action, reason: `${action} needs the conversion leg` };
  }

  const summary = `${zohoModule}: ${JSON.stringify(payload)}`;

  // --------------------------------------------------------------- dry run
  if (cfg?.dryRun !== false) {
    console.log(`[zoho:dry-run] ${action} ${card.account} → ${summary}`);
    return { status: "dry-run", account: card.account, action, summary };
  }

  // ------------------------------------------------------------------ send
  /**
   * The token is minted here and nowhere earlier, so a dry run makes NO network
   * call at all. Zoho allows ten access-token requests per ten minutes; a dry
   * run of the whole pipeline fetching one per card would exhaust that budget
   * on a run that was never going to write anything.
   */
  const token = await getAccessToken(orgId);
  if (!token.ok) {
    return { status: "failed", account: card.account, action, reason: token.message };
  }

  const isCreate = action === "CREATE_LEAD" || action === "CREATE_DEAL";
  const existingId = zohoModule === LEAD ? row.leadId : row.dealId;

  /**
   * A create is the only irreversible thing this function does, so it goes
   * through the intent log (src/domain/zoho/idempotency.ts).
   *
   * Inngest delivers at least once with `retries: 3`, and `pushActionFor`
   * recomputes the action from the row every time — which is right, and is
   * exactly why a retry that ran after the remote write but before the local one
   * saw a null `lead_id`, recomputed CREATE, and made a second Lead in the
   * client's CRM. Up to four per card, unrollbackable, in a system of record we
   * do not own. Latent only because `zoho_dry_run` defaults true.
   *
   * An update needs none of this: it is keyed on an id we already hold, so
   * repeating it is harmless.
   */
  const crmModule = zohoModule as ZohoModule;
  const attemptKey = isCreate ? pushAttemptKey(opportunityId, row.updatedAt) : null;
  let adoptedId: string | null = null;

  if (attemptKey) {
    const decision = await claimCreate(orgId, opportunityId, crmModule, attemptKey);
    if (decision.action === "unknown") {
      // Refusing is the answer. Creating again risks a duplicate we cannot
      // withdraw; the operator can look in the CRM in seconds.
      const reason =
        "An earlier push reached Zoho and its result was never recorded. Check the CRM for this company before pushing again.";
      await block(orgId, opportunityId, reason);
      return { status: "blocked", account: card.account, action, reason };
    }
    if (decision.action === "adopt") adoptedId = decision.remoteId;
  }

  if (attemptKey && !adoptedId) await markCreateSent(opportunityId, crmModule, attemptKey);

  const result = adoptedId
    ? ({ ok: true as const, data: { id: adoptedId, modifiedTime: undefined } })
    : isCreate
      ? await createRecord(token.apiDomain, zohoModule, token.accessToken, payload)
      : await updateRecord(token.apiDomain, zohoModule, existingId!, token.accessToken, payload);

  if (!result.ok) {
    const kind = classifyZohoError(result.error);
    const message = describeZohoError(result.error);
    // A data refusal will never succeed on a retry — quarantine it rather than
    // burning credit on the same rejected payload.
    if (kind === "data") await block(orgId, opportunityId, message);
    // A 429 or a dropped socket is not the card's fault and must not spend a
    // strike — see `spendsStrike` for the rule and the bug it closes.
    else await recordFailure(orgId, opportunityId, message, spendsStrike(kind));
    return { status: "failed", account: card.account, action, reason: message };
  }

  // Before the local write, so the window that produced duplicates is now
  // "attempt says created, card does not" — which a retry resolves by adopting.
  if (attemptKey && !adoptedId) {
    await recordCreateResult(opportunityId, crmModule, attemptKey, result.data.id);
  }

  await withOrg(orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({
        ...(zohoModule === LEAD ? { zohoLeadId: result.data.id } : { zohoDealId: result.data.id }),
        zohoSyncedAt: new Date(),
        zohoModifiedAt: result.data.modifiedTime ? new Date(result.data.modifiedTime) : null,
        zohoSyncError: null,
        zohoBlockedAt: null,
        zohoSyncAttempts: 0,
      })
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));

    // §8 wants an audit entry on every write. `zoho_push` has been declared in
    // the enum since the first migration and never once emitted.
    await tx.insert(activities).values({
      orgId,
      opportunityId,
      type: "zoho_push",
      payloadJson: { action, zohoModule, zohoId: result.data.id },
      actorId: null,
    });
  });

  return { status: isCreate ? "created" : "updated", account: card.account, action, summary };
}

/** The card must not go. Not a failure to retry — a decision. */
async function block(orgId: string, opportunityId: string, reason: string): Promise<void> {
  await db
    .update(opportunities)
    .set({ zohoBlockedAt: new Date(), zohoSyncError: (redactSecrets(reason) ?? reason).slice(0, 400) })
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}

/**
 * Counts a failure. **One statement**, because the count is a circuit breaker.
 *
 * With `spendStrike: false` it records the reason and NOTHING else — no
 * increment, and `zoho_blocked_at` left exactly as it was. Deliberately not
 * recomputed to null, which would clear a quarantine `block()` set over a real
 * data refusal; and not recomputed at all, because a rate limit is no evidence
 * either way about whether this card should be blocked.
 *
 * This read `zoho_sync_attempts`, added one in Node, and wrote it back. Two
 * concurrent failures both read the same number and both wrote the same
 * increment, so N failures could count as one and the "five strikes and
 * quarantine" below might never fire — leaving a permanently rejected payload
 * retried against Zoho forever, burning API credit on a request that cannot
 * succeed. Per-card Inngest concurrency made the collision unlikely rather than
 * impossible; the arithmetic belongs in SQL either way.
 *
 * Both expressions read the column, and inside an UPDATE's SET that is the OLD
 * value — so the attempt count and the blocked decision cannot disagree about
 * which attempt this is. `zoho_sync_attempts` is NOT NULL DEFAULT 0, so there is
 * no null to coalesce.
 */
async function recordFailure(
  orgId: string,
  opportunityId: string,
  reason: string,
  spendStrike = true,
): Promise<void> {
  const error = (redactSecrets(reason) ?? reason).slice(0, 400);
  await db
    .update(opportunities)
    .set(
      spendStrike
        ? {
            zohoSyncAttempts: sql`${opportunities.zohoSyncAttempts} + 1`,
            zohoSyncError: error,
            // Five failures is a card that is not going to start working by itself.
            zohoBlockedAt: sql`case when ${opportunities.zohoSyncAttempts} + 1 >= 5 then now() else null end`,
          }
        : { zohoSyncError: error },
    )
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}
