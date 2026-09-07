import { describe, expect, it } from "vitest";

import {
  convertAmount, entryUnit, formatCompact, formatMoney, fromEntry, isRateStale, MAX_RATE_AGE_DAYS, toEntry,
  effectiveCurrency, fallbackReason, isFallingBack, rateAgeDays, rateFromDecimal,
  rateToDecimal, RATE_SCALE, viewMoney, type FxRate,
} from "./money";

const NOW = new Date("2026-09-07T00:00:00Z");
const fresh = (usdToInr = rateFromDecimal(83.215)): FxRate => ({
  usdToInr,
  updatedAt: new Date("2026-09-06T00:00:00Z"),
});

describe("the rate as an integer", () => {
  it("round-trips a decimal without floating-point drift", () => {
    expect(rateFromDecimal(83.215)).toBe(832_150);
    expect(rateToDecimal(832_150)).toBe(83.215);
    expect(RATE_SCALE).toBe(10_000);
  });
});

describe("convertAmount", () => {
  /**
   * The real number from the pipeline: the biggest live card is $300,000, and
   * pushed unconverted into the INR org it would read as about $3,600.
   */
  it("turns $300,000 into the right rupee figure", () => {
    const r = convertAmount(300_000, "USD", "INR", fresh(), NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.amount).toBe(24_964_500); // 300000 * 83.215
    expect(r.converted).toBe(true);
    // The whole point: nothing like the unconverted number.
    expect(r.amount).not.toBe(300_000);
  });

  /**
   * The property that makes switching Growth Studio to INR a setting change
   * rather than a code change — the multiplication just stops happening.
   */
  it("returns the value untouched when the currencies match", () => {
    for (const c of ["USD", "INR"] as const) {
      const r = convertAmount(300_000, c, c, null, NOW);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.amount).toBe(300_000);
      expect(r.converted).toBe(false);
    }
  });

  it("converts back the other way", () => {
    const r = convertAmount(24_964_500, "INR", "USD", fresh(), NOW);
    expect(r.ok && r.amount).toBe(300_000);
  });

  it("needs no rate at all when no conversion is required", () => {
    // A missing rate must not block a same-currency push.
    expect(convertAmount(1000, "USD", "USD", null, NOW).ok).toBe(true);
  });
});

describe("the refusals — the point of the module", () => {
  it("refuses rather than pricing a deal at a stale rate", () => {
    const stale: FxRate = { usdToInr: rateFromDecimal(83.215), updatedAt: new Date("2026-08-01T00:00:00Z") };
    const r = convertAmount(300_000, "USD", "INR", stale, NOW);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale-rate");
    // The message has to say what to do, not just that something is wrong.
    expect(r.message).toContain("Settings");
    expect(r.message).toMatch(/\d+ days old/);
  });

  it("refuses when there is no rate, rather than passing the number through", () => {
    // Passing it through is the 83x bug. Never fall back.
    for (const bad of [null, { usdToInr: 0, updatedAt: NOW }, { usdToInr: -1, updatedAt: NOW }]) {
      const r = convertAmount(300_000, "USD", "INR", bad, NOW);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe("no-rate");
    }
  });

  it("never silently returns the unconverted amount on failure", () => {
    const r = convertAmount(300_000, "USD", "INR", null, NOW);
    expect(r.ok).toBe(false);
    expect(r).not.toHaveProperty("amount");
  });
});

describe("staleness", () => {
  it("measures age in days", () => {
    expect(rateAgeDays(new Date("2026-09-04T00:00:00Z"), NOW)).toBe(3);
  });

  it("is stale strictly past the threshold", () => {
    const at = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
    expect(isRateStale(at(0), NOW)).toBe(false);
    expect(isRateStale(at(MAX_RATE_AGE_DAYS), NOW)).toBe(false);
    expect(isRateStale(at(MAX_RATE_AGE_DAYS + 0.1), NOW)).toBe(true);
  });
});

describe("formatMoney", () => {
  it("uses the Indian grouping for rupees", () => {
    // 24,96,450 not 2,496,450 — a number a rupee reader can check at a glance.
    expect(formatMoney(2_496_450, "INR")).toBe("₹24,96,450");
    expect(formatMoney(300_000, "USD")).toBe("$300,000");
  });
});

describe("formatCompact — the one formatter", () => {
  it("keeps the dollar shapes the app already renders", () => {
    // These must not change: nine call sites and their column widths depend on it.
    expect(formatCompact(300_000, "USD")).toBe("$300K");
    expect(formatCompact(1_800_000, "USD")).toBe("$1.8M");
    expect(formatCompact(20_000_000, "USD")).toBe("$20M");
    expect(formatCompact(75_000, "USD")).toBe("$75K");
    expect(formatCompact(500, "USD")).toBe("$500");
    expect(formatCompact(0, "USD")).toBe("$0");
  });

  /**
   * The point of the feature. An Indian reader parses lakh and crore; ₹28.3M
   * is technically correct and useless.
   */
  it("uses lakh and crore for rupees", () => {
    expect(formatCompact(28_347_000, "INR")).toBe("₹2.83Cr");
    expect(formatCompact(4_550_000, "INR")).toBe("₹45.5L");
    expect(formatCompact(9_500, "INR")).toBe("₹9,500");
  });

  it("switches units exactly at a lakh and a crore", () => {
    expect(formatCompact(99_999, "INR")).toBe("₹99,999");
    expect(formatCompact(100_000, "INR")).toBe("₹1L");
    expect(formatCompact(9_999_999, "INR")).toBe("₹100L");
    expect(formatCompact(10_000_000, "INR")).toBe("₹1Cr");
  });

  it("groups sub-lakh rupees the Indian way", () => {
    // 45,000 — not 45.0K, and not 45,000 with western grouping at higher values.
    expect(formatCompact(45_000, "INR")).toBe("₹45,000");
  });

  it("drops a pointless trailing zero", () => {
    expect(formatCompact(1_000_000, "USD")).toBe("$1M");
    expect(formatCompact(10_000_000, "INR")).toBe("₹1Cr");
    expect(formatCompact(200_000, "INR")).toBe("₹2L");
  });

  it("handles a negative, which pace-versus-closed can produce", () => {
    expect(formatCompact(-250_000, "USD")).toBe("-$250K");
    expect(formatCompact(-10_000_000, "INR")).toBe("-₹1Cr");
  });
});

describe("viewMoney — what the screens call", () => {
  const rate = { usdToInr: rateFromDecimal(94.49), updatedAt: new Date("2026-09-06T00:00:00Z") };
  const usd = { base: "USD" as const, display: "USD" as const, rate: null };
  const inr = { base: "USD" as const, display: "INR" as const, rate };

  it("shows dollars when dollars are asked for", () => {
    expect(viewMoney(300_000, usd, NOW)).toBe("$300K");
  });

  it("converts and formats in one step", () => {
    // 300000 * 94.49 = 28,347,000 -> 2.83 crore
    expect(viewMoney(300_000, inr, NOW)).toBe("₹2.83Cr");
  });

  /**
   * The rule that keeps every screen honest: a rate too old to price a deal is
   * too old to display one either.
   */
  it("falls back to the base currency when the rate is stale", () => {
    const old = { ...inr, rate: { ...rate, updatedAt: new Date("2026-08-01T00:00:00Z") } };
    expect(viewMoney(300_000, old, NOW)).toBe("$300K");
    expect(effectiveCurrency(old, NOW)).toBe("USD");
    expect(isFallingBack(old, NOW)).toBe(true);
    expect(fallbackReason(old, NOW)).toContain("days old");
  });

  it("falls back when there is no rate at all", () => {
    const none = { ...inr, rate: null };
    expect(viewMoney(300_000, none, NOW)).toBe("$300K");
    expect(fallbackReason(none, NOW)).toContain("no USD→INR rate");
  });

  it("is not 'falling back' when the operator asked for the base currency", () => {
    expect(isFallingBack(usd, NOW)).toBe(false);
    expect(fallbackReason(usd, NOW)).toBeNull();
  });
});

describe("entry units", () => {
  /**
   * Both value inputs were fixed to thousands with a `$` in front. Rupees are
   * not typed in thousands — ₹3Cr is "300 lakh", never "30000 thousand".
   */
  it("types dollars in thousands and rupees in lakh", () => {
    expect(entryUnit("USD")).toEqual({ step: 1_000, label: "K", symbol: "$" });
    expect(entryUnit("INR")).toEqual({ step: 100_000, label: "L", symbol: "₹" });
  });

  it("round-trips a value through the box unchanged", () => {
    for (const [currency, stored] of [["USD", 300_000], ["INR", 30_000_000]] as const) {
      expect(fromEntry(toEntry(stored, currency), currency)).toBe(stored);
    }
  });

  it("keeps the whole wedge-to-whale range a small whole number", () => {
    // The property thousands gives dollars, lakh has to give rupees — or the
    // operator is typing seven digits into a box built for three.
    for (const stored of [7_500_000, 30_000_000, 50_000_000]) {
      const n = toEntry(stored, "INR");
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeLessThan(1000);
    }
  });
});
