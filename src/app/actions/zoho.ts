"use server";

import { revalidatePath } from "next/cache";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { activities, settings } from "@/db/schema";
import { deleteZohoConnection, loadRevocationData } from "@/db/zoho";
import { canManageIntegrations } from "@/domain/access";
import type { Currency } from "@/domain/money";
import { currencyCodeOf } from "@/domain/zoho/currency";
import { LEAD_SOURCE } from "@/domain/zoho/fields";
import { describeZohoError } from "@/domain/zoho/errors";
import { ZOHO_DEAL_STAGES } from "@/domain/zoho/stage";
import { requireSession } from "@/lib/session";
import { zohoGet } from "@/lib/zoho/records";
import { getAccessToken, revokeRefreshToken } from "@/lib/zoho/token";

/**
 * Zoho connection management (PRD §6).
 *
 * Server actions rather than routes: it is what the rest of Settings uses,
 * `requireSession()` works here, and Next's action ids give CSRF protection
 * without a hand-rolled token.
 */

const forbidden = { ok: false as const, message: "You do not have permission to change integrations." };



export type PreflightCheck = {
  label: string;
  state: "ok" | "warn" | "fail";
  detail: string;
};

/**
 * The read-only reconnaissance, behind a button.
 *
 * This is what the old plan called "Phase 0". It cannot run before the OAuth
 * flow exists — every CRM call needs a token — so it lives here instead, which
 * also makes it a permanent diagnostic rather than a one-off script.
 *
 * Every call is a GET. Nothing here can change anything in the CRM.
 */
export async function testZohoConnection(): Promise<
  { ok: true; checks: PreflightCheck[] } | { ok: false; message: string }
> {
  const session = await requireSession();
  if (!canManageIntegrations(session.role)) return forbidden;

  const token = await getAccessToken(session.orgId);
  if (!token.ok) return { ok: false, message: token.message };

  const checks: PreflightCheck[] = [];

  // --- org: currency is the silent-corruption check -----------------------
  const org = await zohoGet<{ org?: Array<Record<string, unknown>> }>(
    token.apiDomain, "/org", token.accessToken,
  );
  if (!org.ok) {
    checks.push({ label: "Organisation", state: "fail", detail: describeZohoError(org.error) });
  } else {
    const row = org.data.org?.[0] ?? {};
    const currency = typeof row.currency === "string" ? row.currency : "unknown";
    checks.push({
      label: "Organisation",
      state: "ok",
      detail: `${typeof row.company_name === "string" ? row.company_name : "connected"} · ${currency}`,
    });
    /**
     * Compared against what Growth Studio actually stores, not a literal.
     *
     * This read `currency === "USD"` and warned "your CRM is in INR but Growth
     * Studio values are USD" — which inverts the moment the base becomes INR,
     * on the very page an operator opens to confirm a currency change worked.
     * It was doubly wrong: `/org` returns `"Indian Rupee"`, so the literal
     * never matched either currency and the check could only ever warn.
     */
    const crmCode = currencyCodeOf(currency);
    const [cfg] = await db
      .select({ base: settings.baseCurrency })
      .from(settings)
      .where(eq(settings.orgId, session.orgId))
      .limit(1);
    const base = (cfg?.base ?? "USD") as Currency;

    checks.push(
      crmCode === base
        ? {
            label: "Currency",
            state: "ok",
            detail: `${crmCode} — matches the values Growth Studio stores, so amounts go across untouched.`,
          }
        : crmCode
          ? {
              label: "Currency",
              state: "ok",
              detail: `${crmCode}, converted from ${base} on the way out.`,
            }
          : {
              label: "Currency",
              state: "warn",
              detail: `Growth Studio cannot price "${currency}". Pushes will refuse rather than send a figure it cannot convert.`,
            },
    );
  }

  // --- Deals: the picklists the very first write depends on ---------------
  const deals = await zohoGet<{ fields?: Array<Record<string, unknown>> }>(
    token.apiDomain, "/settings/fields", token.accessToken, { module: "Deals" },
  );
  if (!deals.ok) {
    checks.push({ label: "Deal fields", state: "fail", detail: describeZohoError(deals.error) });
  } else {
    const fields = deals.data.fields ?? [];
    checks.push(pickListCheck(fields, "Lead_Source", "Lead Source", [LEAD_SOURCE]));
    checks.push(pickListCheck(fields, "Stage", "Deal stages", [...ZOHO_DEAL_STAGES]));
  }

  // --- Leads: does Last_Name force a placeholder contact? -----------------
  const leads = await zohoGet<{ fields?: Array<Record<string, unknown>> }>(
    token.apiDomain, "/settings/fields", token.accessToken, { module: "Leads" },
  );
  if (!leads.ok) {
    checks.push({ label: "Lead fields", state: "fail", detail: describeZohoError(leads.error) });
  } else {
    const fields = leads.data.fields ?? [];
    const lastName = fields.find((f) => f.api_name === "Last_Name");
    const required = lastName ? lastName.system_mandatory === true || lastName.required === true : true;
    checks.push({
      label: "Lead Last_Name",
      state: required ? "warn" : "ok",
      detail: required
        ? "Mandatory, so an unnamed prospect gets the “(no named contact)” placeholder — and converting that Lead would create a Contact with that name."
        : "Optional, so unnamed prospects need no placeholder.",
    });
    checks.push(pickListCheck(fields, "Lead_Source", "Lead Source (Leads)", [LEAD_SOURCE]));
  }

  return { ok: true, checks };
}

/** Is every value we intend to write present in the picklist? */
function pickListCheck(
  fields: Array<Record<string, unknown>>,
  apiName: string,
  label: string,
  needed: string[],
): PreflightCheck {
  const field = fields.find((f) => f.api_name === apiName);
  if (!field) return { label, state: "fail", detail: `No ${apiName} field on this module.` };

  const values = Array.isArray(field.pick_list_values)
    ? (field.pick_list_values as Array<Record<string, unknown>>)
        .map((v) => (typeof v.display_value === "string" ? v.display_value : String(v.actual_value ?? "")))
    : [];

  const missing = needed.filter((n) => !values.includes(n));
  return missing.length === 0
    ? { label, state: "ok", detail: `All ${needed.length} value(s) present.` }
    : {
        // Names exactly what to add — the first write fails with INVALID_DATA
        // otherwise, and that error does not say which value was wrong.
        label,
        state: "fail",
        detail: `Add these to ${apiName} in Zoho: ${missing.join(", ")}`,
      };
}

/** Disconnects, revoking at Zoho where possible. */
export async function disconnectZoho(): Promise<
  { ok: true; revoked: boolean } | { ok: false; message: string }
> {
  const session = await requireSession();
  if (!canManageIntegrations(session.role)) return forbidden;

  const data = await loadRevocationData(session.orgId);
  const revoked = data ? await revokeRefreshToken(data.accountsDomain, data.refreshToken) : false;

  // Deleted regardless of whether the revoke succeeded: a Zoho outage must not
  // block a local disconnect. The operator is told when to remove it by hand.
  const removed = await deleteZohoConnection(session.orgId);
  if (!removed) return { ok: false, message: "Zoho was not connected." };

  await db.insert(activities).values({
    orgId: session.orgId,
    type: "note",
    payloadJson: { action: "zoho_disconnected", revoked },
    actorId: session.userId,
  });

  revalidatePath("/settings");
  return { ok: true, revoked };
}

/**
 * Dry run on or off (PRD §6).
 *
 * `settings.zoho_dry_run` defaults to `true` and, until now, had **no writer
 * anywhere in the codebase** — five read sites and nothing that could change
 * them. The push toast meanwhile told the operator to "turn dry run off in
 * Settings", which was impossible: the same dead-control problem the push leg
 * was built to fix, one layer up.
 *
 * It lives in this file, not `settings.ts`, so it inherits the server-side
 * permission guard. `settings.ts` checks permission in the UI only, and this is
 * the switch that lets records into a client's live CRM.
 */
export async function setZohoDryRun(
  on: boolean,
): Promise<{ ok: true; dryRun: boolean } | { ok: false; message: string }> {
  const session = await requireSession();
  if (!canManageIntegrations(session.role)) return forbidden;

  const updated = await db
    .update(settings)
    .set({ zohoDryRun: on })
    .where(eq(settings.orgId, session.orgId))
    .returning({ dryRun: settings.zohoDryRun });

  if (updated.length === 0) return { ok: false, message: "No settings row for this organisation." };

  // §8 wants an audit entry on every write, and turning this off is the single
  // most consequential setting in the product: it is the moment Growth Studio
  // starts writing into someone else's CRM.
  await db.insert(activities).values({
    orgId: session.orgId,
    type: "note",
    payloadJson: { action: "zoho_dry_run_changed", dryRun: on },
    actorId: session.userId,
  });

  revalidatePath("/settings");
  // The push chip and the pipeline pills read this to decide what to promise.
  revalidatePath("/pipeline");
  return { ok: true, dryRun: on };
}
