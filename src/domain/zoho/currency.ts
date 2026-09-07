/**
 * Zoho's currency string → the code the money math understands.
 *
 * `/org` returns four spellings of the same fact — `iso_code: "INR"`,
 * `currency: "Indian Rupee"`, `currency_locale: "INR"`, `currency_symbol:
 * "Rs."` — and which one gets stored depends on which version of the callback
 * wrote the row. The push compared the stored value against the literal `"INR"`
 * and fell back to the base currency when it did not match, so a connection
 * holding `"Indian Rupee"` priced every Deal in dollars and shipped the number
 * unconverted into a rupee CRM: $300K arriving as ₹3L, off by 83×.
 *
 * Pure, and deliberately conservative. An unrecognised currency returns `null`
 * — "I do not know" — so the caller refuses the push. It must never resolve to
 * a guess: an unknown currency treated as the base one is the same invisible
 * mispricing, one currency further along.
 */

import type { Currency } from "../money";

/** Exact spellings only. A substring match would read "Rupiah" as rupees. */
const CODES: Record<string, Currency> = {
  inr: "INR",
  "indian rupee": "INR",
  "indian rupees": "INR",
  "rs.": "INR",
  rs: "INR",
  "₹": "INR",
  usd: "USD",
  "us dollar": "USD",
  "us dollars": "USD",
  "united states dollar": "USD",
  $: "USD",
};

export function currencyCodeOf(raw: string | null | undefined): Currency | null {
  if (!raw) return null;
  return CODES[raw.trim().toLowerCase()] ?? null;
}
