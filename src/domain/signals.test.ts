import { describe, expect, it } from "vitest";
import {
  AMS_WINDOW_END_DAYS,
  AMS_WINDOW_START_DAYS,
  SIGNALS,
  freshness,
  isAmsWindow,
  signalByCode,
  tierWeight,
} from "./signals";

describe("signal taxonomy", () => {
  it("carries exactly the 27 ratified signals", () => {
    expect(SIGNALS).toHaveLength(27);
  });

  it("has no duplicate codes", () => {
    const codes = SIGNALS.map((s) => s.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("covers 11 Hire signals and 16 Learn signals", () => {
    expect(SIGNALS.filter((s) => s.engine === "Hire")).toHaveLength(11);
    expect(SIGNALS.filter((s) => s.engine === "Learn")).toHaveLength(16);
  });

  it("gives every signal a tier of 1, 2 or 3 and a positive window", () => {
    for (const s of SIGNALS) {
      expect([1, 2, 3]).toContain(s.tier);
      expect(s.windowDays).toBeGreaterThan(0);
    }
  });

  it("looks a signal up by code with its ratified tier and window", () => {
    expect(signalByCode("H1")).toMatchObject({ tier: 1, windowDays: 42, engine: "Hire" });
    expect(signalByCode("L6")).toMatchObject({ tier: 1, windowDays: 180, engine: "Learn" });
    expect(signalByCode("L4")).toMatchObject({ tier: 1, windowDays: 365 });
    expect(signalByCode("H10")).toMatchObject({ tier: 3, windowDays: 30 });
  });

  it("returns undefined for an unknown code rather than throwing", () => {
    expect(signalByCode("ZZ9")).toBeUndefined();
  });
});

describe("tierWeight", () => {
  it("scores tier 1 at 40, tier 2 at 22 and tier 3 at 8", () => {
    expect(tierWeight(1)).toBe(40);
    expect(tierWeight(2)).toBe(22);
    expect(tierWeight(3)).toBe(8);
  });
});

describe("freshness", () => {
  it("is 1 the day the signal lands", () => {
    expect(freshness("H1", 0)).toBe(1);
  });

  it("decays linearly to 0 across the signal's own window", () => {
    expect(freshness("H1", 21)).toBeCloseTo(0.5, 5); // H1 window is 42 days
    expect(freshness("H1", 42)).toBe(0);
  });

  it("clamps to 0 past the window instead of going negative", () => {
    expect(freshness("H1", 500)).toBe(0);
  });

  it("uses each signal's own window, so the same age decays differently", () => {
    // 90 days old: spent on a 42-day window, still half-fresh on a 365-day one.
    expect(freshness("H1", 90)).toBe(0);
    expect(freshness("L4", 90)).toBeGreaterThan(0.7);
  });

  it("treats an unknown code as fully decayed rather than guessing a window", () => {
    expect(freshness("ZZ9", 0)).toBe(0);
  });
});

describe("isAmsWindow", () => {
  it("opens the AMS play for an L6 go-live between 180 and 540 days old", () => {
    expect(isAmsWindow("L6", AMS_WINDOW_START_DAYS)).toBe(true);
    expect(isAmsWindow("L6", 365)).toBe(true);
    expect(isAmsWindow("L6", AMS_WINDOW_END_DAYS)).toBe(true);
  });

  it("stays shut before the window opens and after it closes", () => {
    expect(isAmsWindow("L6", AMS_WINDOW_START_DAYS - 1)).toBe(false);
    expect(isAmsWindow("L6", AMS_WINDOW_END_DAYS + 1)).toBe(false);
  });

  it("applies only to L6 — no other signal resurfaces as an AMS play", () => {
    expect(isAmsWindow("L7", 365)).toBe(false);
    expect(isAmsWindow("H1", 365)).toBe(false);
  });

  it("spans 6 to 18 months as the PRD states", () => {
    expect(AMS_WINDOW_START_DAYS).toBe(180);
    expect(AMS_WINDOW_END_DAYS).toBe(540);
  });
});
