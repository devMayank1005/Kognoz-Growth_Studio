import { describe, expect, it } from "vitest";
import { buildMorningBrief } from "./brief";
import type { Target } from "@/domain/scoring";

const t = (over: Partial<Target> = {}): Target => ({
  name: "Emaar", country: "UAE", industry: "Real Estate", tower: "T4",
  signal: "L1", tier: 1, ageDays: 3, score: 80, relationship: "watch",
  inPipeline: false, ams: false, radarOnly: false,
  evidence: "New CHRO", url: "https://x", date: "2026-09-01",
  ...over,
} as Target);

describe("buildMorningBrief", () => {
  it("counts triggers, fresh tier-1, and companies new to us", () => {
    const b = buildMorningBrief({
      targets: [
        t({ name: "A", tier: 1, ageDays: 2 }),
        t({ name: "B", tier: 1, ageDays: 40 }),
        t({ name: "C", tier: 2, relationship: "new" }),
      ],
      sweepCount: 11,
    });
    expect(b.counts).toEqual({ triggers: 3, freshTierOne: 1, newToUs: 1 });
  });

  it("charts triggers by market, busiest first", () => {
    const b = buildMorningBrief({
      targets: [t({ name: "A", country: "India" }), t({ name: "B", country: "India" }), t({ name: "C", country: "UAE" })],
      sweepCount: 11,
    });
    expect(b.chart?.data).toEqual([{ name: "India", value: 2 }, { name: "UAE", value: 1 }]);
  });

  it("offers the top six doors, skipping anything already in the pipeline", () => {
    const targets = Array.from({ length: 9 }, (_, i) => t({ name: `A${i}`, score: 100 - i }));
    targets[0].inPipeline = true;
    const b = buildMorningBrief({ targets, sweepCount: 11 });
    expect(b.rows).toHaveLength(6);
    expect(b.rows.map((r) => r.company)).not.toContain("A0");
  });

  it("reports the real number of sweeps rather than a hard-coded one", () => {
    // The prototype said "8 markets and 5 radars" regardless of what ran.
    expect(buildMorningBrief({ targets: [t()], sweepCount: 11 }).text).toContain("11");
    expect(buildMorningBrief({ targets: [t()], sweepCount: 4 }).text).toContain("4");
  });

  it("says so plainly when the sweep found nothing, and suggests what to do", () => {
    const b = buildMorningBrief({ targets: [], sweepCount: 11 });
    expect(b.rows).toHaveLength(0);
    expect(b.chart).toBeNull();
    expect(b.text.toLowerCase()).toMatch(/nothing|no new|quiet/);
  });

  it("names failed sweeps instead of hiding a partial result (PRD §4.1)", () => {
    const b = buildMorningBrief({
      targets: [t()],
      sweepCount: 11,
      failed: ["India radar", "Gulf (UAE + KSA)"],
    });
    expect(b.text).toContain("2 sweeps failed");
    expect(b.text).toContain("India radar");
  });

  it("is silent about failures when there are none", () => {
    expect(buildMorningBrief({ targets: [t()], sweepCount: 11 }).text).not.toMatch(/failed/i);
  });
});
