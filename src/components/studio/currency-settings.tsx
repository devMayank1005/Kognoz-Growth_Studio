"use client";

import { useState } from "react";
import { toast } from "sonner";

import { clearFxOverride, fetchFxRate, saveDisplayCurrency, saveFxRate } from "@/app/actions/settings";
import {
  fallbackReason, formatCompact, isRateStale, MAX_RATE_AGE_DAYS,
  rateAgeDays, rateToDecimal, viewMoney, type Currency, type MoneyView,
} from "@/domain/money";
import { TIER_VALUE } from "@/domain/routing";

/**
 * How money is read across the app (PRD §5, §7).
 *
 * Its own section rather than living inside the Zoho panel: the display
 * currency governs every screen, and Zoho is one consumer of the rate rather
 * than its owner. The rate sits here too because the two are useless apart —
 * choosing rupees without a usable rate silently gets you dollars.
 */
export function CurrencySettings({
  money,
  fxSource,
  manualOverride,
  canManage,
}: {
  money: MoneyView;
  fxSource: string | null;
  manualOverride: boolean;
  canManage: boolean;
}) {
  const [busy, setBusy] = useState(false);

  /**
   * Whether the rate is load-bearing right now.
   *
   * When values are stored and read in the same currency nothing converts, so
   * a missing or stale rate is worth showing but is not a failure. Painting it
   * red regardless would train the operator to ignore a red line that
   * sometimes does mean a blocked push.
   */
  const needsRate = money.display !== money.base;
  const [rateInput, setRateInput] = useState(
    money.rate ? String(rateToDecimal(money.rate.usdToInr)) : "",
  );

  const now = new Date();
  const stale = money.rate ? isRateStale(money.rate.updatedAt, now) : true;
  const age = money.rate ? Math.floor(rateAgeDays(money.rate.updatedAt, now)) : null;
  const falling = fallbackReason(money, now);

  async function pick(currency: Currency) {
    if (currency === money.display) return;
    setBusy(true);
    try {
      const r = await saveDisplayCurrency(currency);
      if (!r.ok) return toast.error(r.message);
      toast.success(`Showing ${currency}`);
    } catch {
      toast.error("Could not change the currency");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="font-display text-[13px] text-body">Currency</h2>
      <p className="mb-3 text-[11px] text-faint">
        Display only. Values are stored in {money.base}, and the tier thresholds and the programme
        target stay in {money.base} — a {formatCompact(TIER_VALUE.core, money.base)} card still
        routes as core either way.
      </p>

      <div className="flex items-center gap-1.5">
        {(["USD", "INR"] as const).map((c) => (
          <button
            key={c}
            type="button"
            disabled={busy || !canManage}
            onClick={() => void pick(c)}
            aria-pressed={money.display === c}
            className={`rounded border px-2.5 py-1 text-[13px] transition-colors duration-150 disabled:opacity-40 ${
              money.display === c
                ? "border-accent text-body"
                : "border-line text-muted hover:bg-panel"
            }`}
          >
            {c === "USD" ? "$ USD" : "₹ INR"}
          </button>
        ))}
        <span className="ml-2 text-[11px] text-faint">
          e.g. {viewMoney(TIER_VALUE.core, money, now)}
        </span>
      </div>

      {/* The one place that says the operator is not getting what they asked
          for. Silently rendering dollars after they chose rupees is the
          confusing outcome worth spending a line on. */}
      {falling && <p className="mt-2 text-[12px] text-amber">{falling}</p>}

      {/*
        Deliberately NOT wrapped in `money.display !== money.base`.

        It was — and that made the whole section vanish the moment the two
        currencies agreed: the rate, its age, and every control in it. The rate
        still matters then. It is what lets the operator switch to the other
        currency at all, the nightly fetch keeps running whether or not anyone
        can see it, and a setting nobody can see is a setting nobody can fix.
      */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[11px] uppercase tracking-wide text-faint">USD → INR rate</p>

          {money.rate === null ? (
            <p className={`mt-1 text-[13px] ${needsRate ? "text-danger" : "text-muted"}`}>
              {needsRate
                ? `No rate set — amounts cannot be shown in ${money.display} or sent to Zoho.`
                : "No rate set. Nothing needs one right now, but it is what lets you read these figures in the other currency."}
            </p>
          ) : (
            <p className={`mt-1 text-[13px] ${stale && needsRate ? "text-danger" : "text-body"}`}>
              1 USD = {rateToDecimal(money.rate.usdToInr)} INR
              <span className="text-faint">
                {" · "}
                {age === 0 ? "updated today" : `${age} day${age === 1 ? "" : "s"} old`}
                {fxSource ? ` · ${fxSource}` : ""}
                {manualOverride ? " · override on" : ""}
              </span>
              {stale && (
                <span className="block text-[11px]">
                  {needsRate
                    ? `Older than ${MAX_RATE_AGE_DAYS} days, so screens fall back to ${money.base} and pushes refuse rather than pricing a deal wrongly.`
                    : `Older than ${MAX_RATE_AGE_DAYS} days. Nothing depends on it while amounts are already in ${money.base}.`}
                </span>
              )}
            </p>
          )}

          {canManage && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                aria-label={`${money.base} to ${money.display} rate`}
                placeholder="94.49"
                className="num w-24 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
              />
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await saveFxRate(rateInput);
                    if (!r.ok) return toast.error(r.message);
                    toast.success("Rate saved", {
                      description: "The daily fetch will leave it alone until you clear the override.",
                    });
                  } catch {
                    toast.error("Could not save that rate");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
              >
                Set rate
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await fetchFxRate();
                    if (!r.ok) return toast.error(r.message);

                    /**
                     * Four outcomes, four messages.
                     *
                     * `skipped-override` is the one that earns its keystrokes:
                     * a manually entered rate silences the fetch, so without
                     * saying so this button would report success and change
                     * nothing — which is the exact failure the push button had.
                     */
                    if (r.status === "updated") {
                      toast.success(`Rate updated — 1 USD = ${r.rate} INR`, {
                        description: "From the European Central Bank's daily reference rates.",
                      });
                    } else if (r.status === "skipped-override") {
                      toast.warning("Nothing fetched — a manual rate is set", {
                        description:
                          "Your typed rate takes priority. Choose “use the daily rate instead” first.",
                      });
                    } else if (r.status === "unavailable") {
                      toast.error("The rate source did not answer", {
                        description: "The stored rate is unchanged. Try again, or type one.",
                      });
                    } else {
                      toast.error("No settings row for this organisation");
                    }
                  } catch {
                    toast.error("Could not fetch a rate");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
              >
                {busy ? "…" : "Fetch today’s rate"}
              </button>

              {manualOverride && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await clearFxOverride();
                      toast.success("Back to the daily rate");
                    } catch {
                      toast.error("Could not clear the override");
                    } finally {
                      setBusy(false);
                    }
                  }}
                  className="px-1 text-[11px] text-faint hover:text-body"
                >
                  use the daily rate instead
                </button>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] text-faint">
            Typed values stay {money.base}: {formatCompact(TIER_VALUE.core, money.base)} typed today and next
            week mean the same money, whatever the rate does.
          </p>
        </div>
    </section>
  );
}
