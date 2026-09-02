import { describe, expect, it } from "vitest";
import { UNASSIGNED, byGeography, bySolution, byStage, byTower, curveSeries, openTotal } from "./dashboard";
import { PROGRAM_TARGET, TOWER_TARGETS } from "./revenue";

const card = (over = {}) => ({
  id: "c", account: "A", tower: "T3", practiceId: "hire", stage: "Prospect",
  value: 100_000, country: "UAE", industry: "Real Estate",
  ...over,
});

const CARDS = [
  card({ id: "1", tower: "T3", practiceId: "hire", country: "UAE", stage: "Prospect", value: 300_000 }),
  card({ id: "2", tower: "T4", practiceId: "learncoach", country: "India", stage: "Reached out", value: 250_000 }),
  card({ id: "3", tower: "T3", practiceId: "hire", country: "India", stage: "Prospect", value: 500_000 }),
  card({ id: "4", tower: "T1", practiceId: "family", country: "Malaysia", stage: "Won", value: 400_000 }),
  card({ id: "5", tower: "T2", practiceId: "hrtx", country: "UAE", stage: "Lost", value: 900_000 }),
];

describe("openTotal", () => {
  it("counts only live cards — Won and Lost are not open pipeline", () => {
    expect(openTotal(CARDS)).toBe(300_000 + 250_000 + 500_000);
  });
});

/**
 * ACCEPTANCE #7: "Dashboard panels reconcile to the pipeline totals."
 * This is an invariant, so it is asserted rather than hoped for.
 */
describe("every panel reconciles to the open pipeline total", () => {
  const total = openTotal(CARDS);

  it.each([
    ["tower", byTower],
    ["geography", byGeography],
    ["solution", bySolution],
    ["stage", byStage],
  ])("%s panel sums to the same total", (_name, fn) => {
    const sum = fn(CARDS).reduce((n, row) => n + row.value, 0);
    expect(sum).toBe(total);
  });

  it("still reconciles when a card is missing its country or practice", () => {
    // A panel that silently drops incomplete rows is how a dashboard starts
    // lying. They land in an explicit bucket instead.
    const messy = [...CARDS, card({ id: "6", country: "", practiceId: "", value: 75_000 })];
    const total = openTotal(messy);
    for (const fn of [byTower, byGeography, bySolution, byStage]) {
      expect(fn(messy).reduce((n, r) => n + r.value, 0)).toBe(total);
    }
  });

  it("names the bucket rather than hiding it", () => {
    const rows = byGeography([card({ country: "" })]);
    expect(rows[0].key).toBe(UNASSIGNED);
  });

  it("reconciles trivially when there is no pipeline at all", () => {
    for (const fn of [byTower, byGeography, bySolution, byStage]) {
      expect(fn([]).reduce((n, r) => n + r.value, 0)).toBe(0);
    }
  });
});

describe("byTower", () => {
  it("carries each tower's target so the panel can show progress", () => {
    const rows = byTower(CARDS);
    expect(rows.find((r) => r.key === "T3")?.target).toBe(TOWER_TARGETS.T3);
  });

  it("lists every tower, including ones with nothing in them yet", () => {
    expect(byTower([]).map((r) => r.key).sort()).toEqual(["T1", "T2", "T3", "T4"]);
  });

  it("orders by value, biggest first", () => {
    const rows = byTower(CARDS).filter((r) => r.value > 0);
    expect(rows[0].key).toBe("T3");
  });
});

describe("bySolution", () => {
  it("shows the practice's display name, not its id", () => {
    expect(bySolution(CARDS).find((r) => r.value === 800_000)?.label).toBe("Hire (JobFit AI)");
  });
});

describe("curveSeries", () => {
  const series = curveSeries("2026-09-02", []);

  it("runs the full 18 months", () => {
    expect(series).toHaveLength(18);
    expect(series[0].month).toBe(1);
    expect(series[17].month).toBe(18);
  });

  it("hits the three anchor points the PRD commits to", () => {
    expect(series[5].target).toBeCloseTo(1_500_000, 0);
    expect(series[11].target).toBeCloseTo(6_500_000, 0);
    expect(series[17].target).toBe(PROGRAM_TARGET);
  });

  it("accumulates closed revenue rather than reporting it per month", () => {
    const s = curveSeries("2026-09-02", [{ month: 1, value: 100_000 }, { month: 2, value: 50_000 }]);
    expect(s[0].closed).toBe(100_000);
    expect(s[1].closed).toBe(150_000);
    expect(s[2].closed).toBe(150_000);
  });

  it("marks months that have not happened yet, so the chart can stop the line", () => {
    // Drawing closed flat into the future would read as a forecast. The data
    // still reports the running total; only the chart truncates.
    const s = curveSeries("2026-09-02", [], new Date("2026-09-02T00:00:00Z"));
    expect(s[0].isFuture).toBe(false);
    expect(s[1].isFuture).toBe(true);
    expect(s[17].isFuture).toBe(true);
  });
});
