import { describe, expect, it } from "vitest";
import { curveTarget, monthOf, PROGRAM_TARGET, TOWER_TARGETS } from "./revenue";

const M = 1_000_000;

describe("curveTarget", () => {
  it("hits the three anchor points the PRD commits to", () => {
    expect(curveTarget(6)).toBeCloseTo(1.5 * M, 0);
    expect(curveTarget(12)).toBeCloseTo(6.5 * M, 0);
    expect(curveTarget(18)).toBeCloseTo(20 * M, 0);
  });

  it("starts at zero in month zero", () => {
    expect(curveTarget(0)).toBe(0);
  });

  it("rises monotonically across the whole programme", () => {
    for (let m = 1; m <= 18; m++) expect(curveTarget(m)).toBeGreaterThan(curveTarget(m - 1));
  });

  it("clamps at $20M beyond month 18 rather than extrapolating", () => {
    expect(curveTarget(24)).toBe(20 * M);
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
  it("splits T2 $6M / T3 $5M / T4 $5M / T1 $4M", () => {
    expect(TOWER_TARGETS).toEqual({ T1: 4 * M, T2: 6 * M, T3: 5 * M, T4: 5 * M });
  });

  it("sums to the $20M north star", () => {
    const sum = Object.values(TOWER_TARGETS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(PROGRAM_TARGET);
    expect(sum).toBe(20 * M);
  });
});
