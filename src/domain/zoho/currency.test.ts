import { describe, expect, it } from "vitest";

import { currencyCodeOf } from "./currency";

describe("currencyCodeOf", () => {
  /**
   * The value that was actually sitting in `zoho_connections.zoho_currency`
   * when the first dry run ran. `conn.currency === "INR"` was false, so the
   * push fell back to the base currency, `convertAmount` became a no-op, and
   * every Deal was priced at 300000 — $300K landing in a rupee CRM as ₹3L.
   */
  it("reads Zoho's currency NAME, not just the ISO code", () => {
    expect(currencyCodeOf("Indian Rupee")).toBe("INR");
    expect(currencyCodeOf("INR")).toBe("INR");
    expect(currencyCodeOf("Rs.")).toBe("INR");
    expect(currencyCodeOf("₹")).toBe("INR");
  });

  it("reads the dollar in its three forms", () => {
    expect(currencyCodeOf("USD")).toBe("USD");
    expect(currencyCodeOf("US Dollar")).toBe("USD");
    expect(currencyCodeOf("$")).toBe("USD");
  });

  it("ignores case and surrounding space", () => {
    expect(currencyCodeOf("  indian rupee ")).toBe("INR");
    expect(currencyCodeOf("us dollar")).toBe("USD");
  });

  /**
   * The point of the whole function. An unrecognised currency must come back as
   * "I do not know" so the caller can refuse — never as a guess. A CRM in euros
   * silently treated as dollars is the same invisible mispricing one currency
   * further along.
   */
  it("returns null rather than guessing", () => {
    for (const raw of ["EUR", "Euro", "AED", "Dirham", "", "   ", null, undefined]) {
      expect(currencyCodeOf(raw), String(raw)).toBeNull();
    }
  });

  it("does not match on a shared substring", () => {
    // "Rupiah" is Indonesia's currency and starts the same way.
    expect(currencyCodeOf("Indonesian Rupiah")).toBeNull();
  });
});
