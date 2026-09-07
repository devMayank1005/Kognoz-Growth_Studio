import { eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import { settings } from "@/db/schema";
import type { Currency, MoneyView } from "@/domain/money";

/**
 * The org's money-display settings, resolved once per request.
 *
 * `cache()` because the studio layout and the page beneath it both need it, and
 * this used to be the shape of bug that added a whole round trip in series to
 * every render (see `loadPipeline`).
 */
export const loadMoneyView = cache(async function loadMoneyView(orgId: string): Promise<MoneyView> {
  const [row] = await db
    .select({
      base: settings.baseCurrency,
      display: settings.displayCurrency,
      rate: settings.fxUsdInr,
      updatedAt: settings.fxUpdatedAt,
    })
    .from(settings)
    .where(eq(settings.orgId, orgId))
    .limit(1);

  return {
    base: (row?.base ?? "USD") as Currency,
    display: (row?.display ?? "USD") as Currency,
    rate: row?.rate && row.updatedAt ? { usdToInr: row.rate, updatedAt: row.updatedAt } : null,
  };
});
