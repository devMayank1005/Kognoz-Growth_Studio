import { describe, expect, it } from "vitest";

import { IST_OFFSET_MINUTES, formatClock, formatDay, formatStamp } from "./clock";

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

describe("formatDay and formatStamp", () => {
  // 06:04 IST on Monday 7 September 2026 is 00:34 UTC the same day.
  const brief = "2026-09-07T00:34:00.000Z";

  it("names the day and month in IST, not UTC", () => {
    expect(formatDay(brief)).toBe("Monday 7 September");
    expect(formatStamp(brief)).toBe("Monday 7 September, 06:04 IST");
  });

  /**
   * The reason this exists rather than toLocaleDateString: the server runs UTC
   * on Vercel and the browser runs IST, and the mismatch made React regenerate
   * the tree and wipe the saved theme off <html>. Byte-identical output is the
   * whole requirement.
   */
  it("crosses the date line into IST correctly", () => {
    // 20:00 UTC is already the NEXT day in India.
    expect(formatDay("2026-09-06T20:00:00.000Z")).toBe("Monday 7 September");
    expect(formatClock("2026-09-06T20:00:00.000Z")).toBe("01:30");
  });

  it("returns empty for nothing, rather than a broken date", () => {
    for (const bad of [null, undefined, "", "not a date"]) {
      expect(formatDay(bad), String(bad)).toBe("");
      expect(formatStamp(bad), String(bad)).toBe("");
    }
  });

  it("is byte-identical whatever the host timezone", () => {
    // No Intl and no host lookup means there is nothing to vary.
    expect(formatStamp(brief)).toBe(formatStamp(brief));
    expect(formatDay(brief)).not.toMatch(/undefined|NaN|Invalid/);
  });
});
