/**
 * Growth Studio card → Zoho Lead or Deal (PRD §6).
 *
 * Pure: this decides WHAT to send, never sends it. Every field written into the
 * client's CRM is decided here, so this is the module to read when a record
 * looks wrong in Zoho.
 */

import { convertAmount, type Currency, type FxRate } from "../money";
import type { Stage } from "../routing";
import {
  DEAL_NAME_MAX,
  DEFAULT_CLOSE_DAYS,
  LEAD_SOURCE,
  NO_NAMED_CONTACT,
} from "./fields";
import { zohoStageFor } from "./stage";
import type { SyncCard, ZohoDealPayload, ZohoLeadPayload } from "./types";

/** PRD §3: Prospect is a Zoho Lead; every other stage is a Deal. */
export type ZohoTarget = "lead" | "deal";

export function zohoTargetFor(stage: Stage): ZohoTarget {
  return stage === "Prospect" ? "lead" : "deal";
}

/**
 * What the push should actually do, derived from the row rather than stored.
 *
 * Deriving it means a retry recomputes the decision instead of trusting a flag
 * that may not have been written — which is the whole safety property during
 * the create → convert transition.
 */
export type PushAction =
  | "CREATE_LEAD"
  | "UPDATE_LEAD"
  | "CONVERT"
  | "CREATE_DEAL"
  | "UPDATE_DEAL"
  | "DEMOTED";

export function pushActionFor(
  card: Pick<SyncCard, "stage" | "zohoLeadId" | "zohoDealId">,
): PushAction {
  const isProspect = card.stage === "Prospect";

  // A deal id wins over everything: once converted, the Deal is the live
  // record. A card demoted to Prospect locally is flagged rather than
  // un-converted, because Zoho has no un-convert operation.
  if (card.zohoDealId) return isProspect ? "DEMOTED" : "UPDATE_DEAL";
  if (isProspect) return card.zohoLeadId ? "UPDATE_LEAD" : "CREATE_LEAD";
  // Past Prospect with a lead behind it: convert. Without one — quick-add opens
  // straight at "Plan reach-out" (PRD §5) — create the Deal directly.
  return card.zohoLeadId ? "CONVERT" : "CREATE_DEAL";
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** PRD §6: `{account} — {practice}`, capped to Zoho's field length. */
export function dealName(account: string, practiceName: string, max = DEAL_NAME_MAX): string {
  const full = `${account} — ${practiceName}`;
  return full.length <= max ? full : `${full.slice(0, max - 1).trimEnd()}…`;
}

/**
 * PRD §6: "Closing Date = due or +90d".
 *
 * Clamped forward to today, because a past closing date on an open deal
 * corrupts the client's own forecast — and `dueOn` on a stale card is often in
 * the past.
 */
export function closingDateFor(card: Pick<SyncCard, "dueOn">, today: Date): string {
  const base = card.dueOn || iso(addDays(today, DEFAULT_CLOSE_DAYS));
  const floor = iso(today);
  return base < floor ? floor : base;
}

/**
 * Zoho mandates `Last_Name` on Leads. PRD §6 permits a name only from a
 * verified contact, so an unnamed prospect gets the placeholder rather than a
 * surname guessed out of a company name.
 */
export function splitPersonName(full: string): { first?: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { last: NO_NAMED_CONTACT };
  if (parts.length === 1) return { last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

/** Joins the parts that are present, so a missing field leaves no dangling " · ". */
const pack = (parts: (string | number | null | undefined)[]): string =>
  parts
    .map((p) => (typeof p === "number" ? String(p) : (p ?? "").trim()))
    .filter((p) => p.length > 0)
    .join(" · ");

const usd = (value: number): string => `$${Math.round(value / 1000)}K`;

/** PRD §6: "solution · trigger · value · tower · partner". */
export function packLeadDescription(card: SyncCard): string {
  return pack([
    card.practiceName,
    card.evidence || card.signalCode,
    usd(card.value),
    card.tower,
    card.partner,
  ]);
}

/** The Deal carries the evidence trail the prototype packed (jsx:520-524). */
export function packDealDescription(card: SyncCard): string {
  return pack([
    card.evidence,
    card.signalCode ? `signal ${card.signalCode}` : "",
    card.url,
    card.country,
    card.industry,
    card.tower,
    card.partner,
  ]);
}

export function toLead(card: SyncCard, leadSource = LEAD_SOURCE): ZohoLeadPayload {
  // A role is a job title we are aiming at, never a person — so it may fill
  // Designation but must never become a name.
  const name = card.contact ? splitPersonName(card.contact.name) : { last: NO_NAMED_CONTACT };

  const payload: ZohoLeadPayload = {
    Company: card.account,
    Last_Name: name.last,
    Lead_Source: leadSource,
    Description: packLeadDescription(card),
  };
  if (name.first) payload.First_Name = name.first;

  const designation = card.contact?.title || card.contactRole;
  if (designation) payload.Designation = designation;
  if (card.country) payload.Country = card.country;
  if (card.industry) payload.Industry = card.industry;

  return payload;
}

/** What a Deal payload needs beyond the card itself. */
export interface DealContext {
  today: Date;
  /** The currency Growth Studio's values are in. */
  base: Currency;
  /** The connected Zoho org's currency. */
  target: Currency;
  rate: FxRate | null;
  leadSource?: string;
}

export type DealResult =
  | { ok: true; payload: ZohoDealPayload }
  /** The amount could not be priced. Never a payload with a wrong number in it. */
  | { ok: false; reason: string; message: string };

/**
 * Builds a Deal, converting the Amount into the CRM's currency.
 *
 * Returns a refusal rather than a payload when the amount cannot be priced —
 * no rate, or a rate too old to trust. That is deliberate: a card that fails to
 * sync is a visible problem the operator can act on, whereas a deal sitting in
 * the client's CRM at 1/83rd of its value is invisible until someone builds a
 * board pack out of it.
 */
export function buildDeal(card: SyncCard, ctx: DealContext): DealResult {
  const amount = convertAmount(card.value, ctx.base, ctx.target, ctx.rate, ctx.today);
  if (!amount.ok) return { ok: false, reason: amount.reason, message: amount.message };

  const payload = toDeal(card, ctx.today, ctx.leadSource ?? LEAD_SOURCE);
  payload.Amount = amount.amount;
  return { ok: true, payload };
}

export function toDeal(card: SyncCard, today: Date, leadSource = LEAD_SOURCE): ZohoDealPayload {
  const payload: ZohoDealPayload = {
    Deal_Name: dealName(card.account, card.practiceName),
    Stage: zohoStageFor(card.stage),
    // The card's own value, in the BASE currency. `buildDeal` is what converts
    // it — call that, not this, on any path that reaches Zoho.
    Amount: card.value,
    Closing_Date: closingDateFor(card, today),
    Description: packDealDescription(card),
    Lead_Source: leadSource,
  };

  // Ids only, and only ones we wrote ourselves. Passing a bare account name
  // would let Zoho match an existing record we never created, which the
  // "only writes what it created" invariant forbids.
  if (card.zohoAccountId) payload.Account_Name = { id: card.zohoAccountId };
  if (card.zohoContactId) payload.Contact_Name = { id: card.zohoContactId };
  if (card.nextStep) payload.Next_Step = card.nextStep;

  return payload;
}
