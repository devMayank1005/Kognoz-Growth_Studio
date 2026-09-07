/**
 * Money across two currencies (PRD §5, §7).
 *
 * Growth Studio stores USD — the $20M programme, the wedge/core/whale
 * thresholds and every displayed figure. The connected Zoho org is in INR.
 * Pushing a USD number into an INR field understates it by roughly 83x, and
 * nothing about the result looks wrong: a $300,000 deal simply becomes a
 * ₹300,000 deal. This module is the only place that conversion happens.
 */

export type Currency = "USD" | "INR";

/**
 * A rate, scaled by 10,000.
 *
 * An integer because money must not ride on binary floating point, and because
 * every other value in this codebase is already an integer. 83.2150 is 832150.
 */
export const RATE_SCALE = 10_000;

export interface FxRate {
  /** USD -> INR, scaled by RATE_SCALE. */
  usdToInr: number;
  updatedAt: Date;
}

/** Past this, a rate is not trustworthy enough to price a deal with. */
export const MAX_RATE_AGE_DAYS = 3;

export function rateAgeDays(updatedAt: Date, now: Date): number {
  return (now.getTime() - updatedAt.getTime()) / 86_400_000;
}

export function isRateStale(updatedAt: Date, now: Date, maxDays = MAX_RATE_AGE_DAYS): boolean {
  return rateAgeDays(updatedAt, now) > maxDays;
}

/** Human form of the stored integer, for display and for entry. */
export function rateToDecimal(scaled: number): number {
  return scaled / RATE_SCALE;
}

export function rateFromDecimal(value: number): number {
  return Math.round(value * RATE_SCALE);
}

export type ConversionResult =
  | { ok: true; amount: number; converted: boolean }
  /** Deliberately a refusal, not a fallback — see `convertAmount`. */
  | { ok: false; reason: "stale-rate" | "no-rate" | "unsupported"; message: string };

/**
 * Converts an amount between the two currencies.
 *
 * Returns the value **untouched** when the currencies match, so the day
 * `settings.base_currency` becomes INR the multiplication simply stops
 * happening — there is no branch anyone has to remember to remove.
 *
 * When a conversion IS needed and the rate is stale, this REFUSES rather than
 * converting at a rate nobody trusts or, worse, passing the number through
 * unconverted. A card that did not sync is a visible problem; a deal priced at
 * 1/83rd of its value in the client's CRM is an invisible one, and it is the
 * kind that gets discovered in a board pack.
 */
export function convertAmount(
  value: number,
  from: Currency,
  to: Currency,
  rate: FxRate | null,
  now: Date,
  maxAgeDays = MAX_RATE_AGE_DAYS,
): ConversionResult {
  if (from === to) return { ok: true, amount: value, converted: false };

  if (!rate || rate.usdToInr <= 0) {
    return {
      ok: false,
      reason: "no-rate",
      message: "No USD→INR rate is set, so this amount cannot be sent to a rupee CRM.",
    };
  }

  if (isRateStale(rate.updatedAt, now, maxAgeDays)) {
    const days = Math.floor(rateAgeDays(rate.updatedAt, now));
    return {
      ok: false,
      reason: "stale-rate",
      message: `The USD→INR rate is ${days} days old. Update it in Settings before sending amounts to Zoho.`,
    };
  }

  if (from === "USD" && to === "INR") {
    return { ok: true, amount: Math.round((value * rate.usdToInr) / RATE_SCALE), converted: true };
  }
  if (from === "INR" && to === "USD") {
    return { ok: true, amount: Math.round((value * RATE_SCALE) / rate.usdToInr), converted: true };
  }

  return {
    ok: false,
    reason: "unsupported",
    message: `No conversion defined from ${from} to ${to}.`,
  };
}

/** `₹24,96,450` / `$300,000`, in full. For a detail line, not a table cell. */
export function formatMoney(value: number, currency: Currency): string {
  return currency === "INR"
    ? `₹${value.toLocaleString("en-IN")}`
    : `$${value.toLocaleString("en-US")}`;
}

/** Drops a trailing `.0` / `.00` so `$1.0M` reads as `$1M`. */
function trim(n: number, places: number): string {
  return n.toFixed(places).replace(/\.?0+$/, "");
}

/**
 * The one money formatter for the interface.
 *
 * Replaces nine near-identical local copies that had already drifted into three
 * different shapes — `$1.8M` in one place, `$1.80M` in another, `$1800K` in a
 * third — and every one of them hardcoded to dollars.
 *
 * **Rupees abbreviate in lakh and crore, not thousands and millions.**
 * ₹2,83,47,000 is ₹2.83Cr to the people who will read it; rendering it as
 * ₹28.3M is technically true and practically unreadable. That difference is the
 * entire reason this is a display feature rather than swapping the symbol.
 */
export function formatCompact(value: number, currency: Currency): string {
  const sign = value < 0 ? "-" : "";
  const n = Math.abs(value);

  if (currency === "INR") {
    // 1 crore = 1,00,00,000 · 1 lakh = 1,00,000
    if (n >= 10_000_000) return `${sign}₹${trim(n / 10_000_000, 2)}Cr`;
    if (n >= 100_000) return `${sign}₹${trim(n / 100_000, 2)}L`;
    // Below a lakh, show it in full — with Indian grouping, so 45,000 not 45.0K.
    return `${sign}₹${n.toLocaleString("en-IN")}`;
  }

  if (n >= 1_000_000) return `${sign}$${trim(n / 1_000_000, 1)}M`;
  if (n >= 1_000) return `${sign}$${Math.round(n / 1_000)}K`;
  return `${sign}$${n}`;
}

/**
 * Whether the stored currency and the programme constants agree.
 *
 * They can disagree for exactly one reason: a currency re-denomination is
 * half-applied — the data migrated but the code did not ship, or the reverse.
 * In that window a card priced with the wrong-magnitude constants is stored
 * permanently wrong and looks entirely plausible, which is the failure this
 * codebase keeps having to design around.
 *
 * So writes refuse instead. It fails closed, it needs nobody to remember
 * anything, and it protects the reverse case too: a deploy rolled back onto
 * migrated data.
 */
export function constantsMatch(base: Currency, constants: Currency): boolean {
  return base === constants;
}

export const MIGRATION_IN_PROGRESS =
  "Growth Studio is part-way through a currency change: the stored currency and the programme thresholds disagree. Adding and re-pricing are paused until it finishes.";

/**
 * How money is TYPED IN, per currency.
 *
 * Both value inputs were fixed to thousands with a `$` in front — `300` meaning
 * $300K. Rupees are not entered in thousands: ₹3,00,00,000 is "3 crore" or
 * "300 lakh", never "30000 thousand". Lakh is the unit that keeps the whole
 * wedge-to-whale range a small whole number (75 to 500), which is exactly the
 * property thousands gives dollars.
 */
export interface EntryUnit {
  /** Multiply a typed number by this to get the stored amount. */
  step: number;
  /** Shown after the input. */
  label: string;
  /** Shown before it. */
  symbol: string;
}

export function entryUnit(currency: Currency): EntryUnit {
  return currency === "INR"
    ? { step: 100_000, label: "L", symbol: "₹" }
    : { step: 1_000, label: "K", symbol: "$" };
}

/** Stored amount → the number to put in the box. */
export function toEntry(value: number, currency: Currency): number {
  return Math.round(value / entryUnit(currency).step);
}

/** The number in the box → the amount to store. */
export function fromEntry(entered: number, currency: Currency): number {
  return Math.round(entered * entryUnit(currency).step);
}

/**
 * Everything a component needs to render money, in one serialisable object.
 *
 * Passed from server components down to client ones as a prop — the same shape
 * `open`/`closed`/`pace` already travel in. That is what makes the org-wide
 * setting work without a cookie, a store, or the blocking `<head>` script the
 * theme needs: the server already knows the answer before the first paint.
 */
export interface MoneyView {
  /** The currency values are STORED in. */
  base: Currency;
  /** The currency the operator asked to read. */
  display: Currency;
  rate: FxRate | null;
}

/**
 * The currency actually rendered.
 *
 * Falls back to `base` when a conversion is needed but the rate cannot support
 * it. Showing a stale conversion across every screen is the failure worth
 * avoiding: the numbers would all be quietly wrong and nothing would say so.
 */
export function effectiveCurrency(view: MoneyView, now = new Date()): Currency {
  if (view.display === view.base) return view.base;
  if (!view.rate || view.rate.usdToInr <= 0) return view.base;
  if (isRateStale(view.rate.updatedAt, now)) return view.base;
  return view.display;
}

/** True when the operator asked for a currency they are not getting. */
export function isFallingBack(view: MoneyView, now = new Date()): boolean {
  return view.display !== view.base && effectiveCurrency(view, now) === view.base;
}

/** Why the fallback happened, for the one place that says so out loud. */
export function fallbackReason(view: MoneyView, now = new Date()): string | null {
  if (!isFallingBack(view, now)) return null;
  if (!view.rate || view.rate.usdToInr <= 0) {
    return `Showing ${view.base}: no ${view.base}→${view.display} rate is set.`;
  }
  const days = Math.floor(rateAgeDays(view.rate.updatedAt, now));
  return `Showing ${view.base}: the rate is ${days} day${days === 1 ? "" : "s"} old.`;
}

/**
 * Convert and format in one call — the only money helper the UI needs.
 *
 * Every displayed figure goes through here, so the fallback rule is applied in
 * exactly one place and cannot be forgotten on a screen.
 */
export function viewMoney(value: number, view: MoneyView, now = new Date()): string {
  const to = effectiveCurrency(view, now);
  if (to === view.base) return formatCompact(value, view.base);

  const converted = convertAmount(value, view.base, to, view.rate, now);
  // `effectiveCurrency` already proved this can succeed; the guard is here so a
  // future change to one cannot silently produce an unconverted number.
  return converted.ok ? formatCompact(converted.amount, to) : formatCompact(value, view.base);
}
