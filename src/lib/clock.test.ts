import { describe, expect, it } from "vitest";

import { formatClock, IST_OFFSET_MINUTES } from "./clock";

describe("formatClock", () => {
  /**
   * The status line used `toLocaleTimeString([], …)`, which resolves the locale
   * and timezone from the host. The server (UTC) and the browser (IST) never
   * produced the same string, so React 19 hit a hydration mismatch and
   * regenerated the tree — stripping `data-theme` off <html> and discarding the
   * operator's saved theme on every page load. The fix has to be deterministic
   * on both sides, which means no Intl and no host timezone.
   */
  it("gives the same answer regardless of the host timezone", () => {
    expect(formatClock("2026-09-04T00:12:00.000Z")).toBe("05:42");
  });

  it("pads to two digits", () => {
    expect(formatClock("2026-09-04T01:35:00.000Z")).toBe("07:05");
  });

  it("wraps past midnight IST", () => {
    expect(formatClock("2026-09-04T19:30:00.000Z")).toBe("01:00");
  });

  it("uses the India offset by default", () => {
    expect(IST_OFFSET_MINUTES).toBe(330);
  });

  it("accepts an explicit offset", () => {
    expect(formatClock("2026-09-04T00:00:00.000Z", 240)).toBe("04:00");
  });

  it("returns an empty string for missing or unparseable input", () => {
    expect(formatClock(null)).toBe("");
    expect(formatClock(undefined)).toBe("");
    expect(formatClock("")).toBe("");
    expect(formatClock("not a date")).toBe("");
  });

  it("is stable across repeated calls", () => {
    const iso = "2026-09-04T06:00:00.000Z";
    expect(formatClock(iso)).toBe(formatClock(iso));
  });
});
