import { and, eq } from "drizzle-orm";

import { db, withOrg } from "@/db/client";
import { loadDnc, loadPipeline } from "@/db/queries";
import { activities, opportunities, settings, zohoConnections } from "@/db/schema";
import { isDoNotContact } from "@/domain/dnc";
import { classifyZohoError, describeZohoError } from "@/domain/zoho/errors";
import { LEAD_SOURCE } from "@/domain/zoho/fields";
import { blockedReason, buildDeal, pushActionFor, toLead, type PushAction } from "@/domain/zoho/to-zoho";
import { currencyCodeOf } from "@/domain/zoho/currency";
import { loadMoneyView } from "@/lib/money-view";
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

  const result = isCreate
    ? await createRecord(token.apiDomain, zohoModule, token.accessToken, payload)
    : await updateRecord(token.apiDomain, zohoModule, existingId!, token.accessToken, payload);

  if (!result.ok) {
    const kind = classifyZohoError(result.error);
    const message = describeZohoError(result.error);
    // A data refusal will never succeed on a retry — quarantine it rather than
    // burning credit on the same rejected payload.
    if (kind === "data") await block(orgId, opportunityId, message);
    else await recordFailure(orgId, opportunityId, message);
    return { status: "failed", account: card.account, action, reason: message };
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

async function recordFailure(orgId: string, opportunityId: string, reason: string): Promise<void> {
  const [row] = await db
    .select({ n: opportunities.zohoSyncAttempts })
    .from(opportunities)
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)))
    .limit(1);

  const next = (row?.n ?? 0) + 1;
  await db
    .update(opportunities)
    .set({
      zohoSyncAttempts: next,
      zohoSyncError: (redactSecrets(reason) ?? reason).slice(0, 400),
      // Five failures is a card that is not going to start working by itself.
      zohoBlockedAt: next >= 5 ? new Date() : null,
    })
    .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
}
