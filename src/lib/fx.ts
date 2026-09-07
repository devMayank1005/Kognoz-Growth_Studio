import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { rateFromDecimal } from "@/domain/money";

/**
 * The daily USD→INR rate.
 *
 * Growth Studio stores USD and the connected Zoho org is in rupees, so every
 * Amount crossing that boundary needs a rate. It is fetched once a morning and
 * can be overridden by hand in Settings.
 */

/**
 * A public, keyless endpoint, deliberately.
 *
 * A rate this small does not justify an API key in the env, a vendor account,
 * or a billing relationship — and a fetch failure is not an error state here:
 * the previous rate simply stays and its AGE is what tells the operator
 * something is wrong. `convertAmount` refuses once that age passes three days,
 * so a quietly dead feed cannot silently misprice a deal.
 */
const RATE_URL = "https://api.frankfurter.app/latest?from=USD&to=INR";

export async function fetchUsdInr(): Promise<number | null> {
  try {
    const res = await fetch(RATE_URL, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (!res.ok) return null;
    const body = (await res.json()) as { rates?: { INR?: number } };
    const rate = body.rates?.INR;
    // Sanity band, not a forecast: a malformed or unit-shifted response must
    // not become a rate that misprices every deal by a factor of a hundred.
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 1 || rate > 1000) return null;
    return rate;
  } catch {
    return null;
  }
}

export interface FxUpdate {
  status: "updated" | "skipped-override" | "unavailable" | "no-settings";
  rate?: number;
}

/**
 * Refreshes the stored rate for one org.
 *
 * Skips entirely while `fxManualOverride` is set — that flag is the operator
 * saying "use my number", and overwriting it overnight would make the override
 * meaningless.
 */
export async function refreshFxRate(orgId: string): Promise<FxUpdate> {
  const [row] = await db
    .select({ override: settings.fxManualOverride })
    .from(settings)
    .where(eq(settings.orgId, orgId))
    .limit(1);

  if (!row) return { status: "no-settings" };
  if (row.override) return { status: "skipped-override" };

  const rate = await fetchUsdInr();
  if (rate === null) return { status: "unavailable" };

  await db
    .update(settings)
    .set({ fxUsdInr: rateFromDecimal(rate), fxUpdatedAt: new Date(), fxSource: "fetched" })
    .where(eq(settings.orgId, orgId));

  return { status: "updated", rate };
}
