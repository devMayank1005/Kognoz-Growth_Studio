import { describe, expect, it } from "vitest";
import { formatCompact } from "./money";
import {
  curveTarget, monthOf, PROGRAM_TARGET, PROGRAM_TARGET_USD, REDENOMINATION, TOWER_TARGETS,
} from "./revenue";

/** One crore. The unit the programme is actually planned in. */
const CR = 10_000_000;

describe("curveTarget", () => {
  it("hits the three anchor points the PRD commits to", () => {
    expect(curveTarget(6)).toBeCloseTo(15 * CR, 0);
    expect(curveTarget(12)).toBeCloseTo(65 * CR, 0);
    expect(curveTarget(18)).toBeCloseTo(200 * CR, 0);
  });

  it("starts at zero in month zero", () => {
    expect(curveTarget(0)).toBe(0);
  });

  it("rises monotonically across the whole programme", () => {
    for (let m = 1; m <= 18; m++) expect(curveTarget(m)).toBeGreaterThan(curveTarget(m - 1));
  });

  it("clamps at ₹200Cr beyond month 18 rather than extrapolating", () => {
    expect(curveTarget(24)).toBe(200 * CR);
  });
});

describe("monthOf", () => {
  it("reports month 1 on the programme start date", () => {
    expect(monthOf("2026-09-02", new Date("2026-09-02"))).toBe(1);
  });

  it("reports month 2 once a full average month has elapsed", () => {
    expect(monthOf("2026-09-02", new Date("2026-10-05"))).toBe(2);
  });

  it("never returns less than 1, even before the start date", () => {
    expect(monthOf("2026-09-02", new Date("2026-01-01"))).toBe(1);
  });
});

describe("tower targets", () => {
  it("splits T2 ₹60Cr / T3 ₹50Cr / T4 ₹50Cr / T1 ₹40Cr", () => {
    expect(TOWER_TARGETS).toEqual({ T1: 40 * CR, T2: 60 * CR, T3: 50 * CR, T4: 50 * CR });
  });

  it("sums to the ₹200Cr north star", () => {
    const sum = Object.values(TOWER_TARGETS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(PROGRAM_TARGET);
    expect(sum).toBe(200 * CR);
  });
});

/**
 * These assert that the constants are RUPEES, not that ×100 was computed
 * correctly — a test asserting `PROGRAM_TARGET === 20_000_000 * 100` would be
 * tautological. The failure worth catching is someone "fixing" a number back
 * to dollars, and only a magnitude check sees that.
 */
describe("the re-denomination holds", () => {
  it("keeps the target in crore, not millions", () => {
    expect(PROGRAM_TARGET).toBeGreaterThan(100 * CR);
    expect(formatCompact(PROGRAM_TARGET, "INR")).toBe("₹200Cr");
  });

  it("still encodes the $20M commitment exactly", () => {
    expect(PROGRAM_TARGET).toBe(PROGRAM_TARGET_USD * REDENOMINATION.rate);
    expect(formatCompact(PROGRAM_TARGET_USD, "USD")).toBe("$20M");
  });

  it("records how and when the conversion happened", () => {
    expect(REDENOMINATION.from).toBe("USD");
    expect(REDENOMINATION.to).toBe("INR");
    expect(REDENOMINATION.migration).toBe("0011");
  });
});
