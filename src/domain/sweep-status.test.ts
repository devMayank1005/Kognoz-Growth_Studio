import { describe, expect, it } from "vitest";

import { latestBatch, summariseLatest, sweepWarning, type SweepRow } from "./sweep-status";

const row = (iso: string, over: Partial<SweepRow> = {}): SweepRow => ({
  startedAt: new Date(iso),
  market: "India",
  itemsFound: 1,
  errors: null,
  dropped: null,
  webSearchDegraded: false,
  ...over,
});

/** The real shape of a morning: eleven markets over about eleven minutes. */
const morning = (base: string, over: Partial<SweepRow>[] = []) =>
  Array.from({ length: 11 }, (_, i) =>
    row(new Date(new Date(base).getTime() + i * 60_000).toISOString(), over[i] ?? {}),
  );

describe("latestBatch", () => {
  /**
   * The bug, reproduced. Today had two runs: 05:30 (one market failed on a
   * transient 529) and 11:39 (completely clean). The old code scanned both and
   * reported failure all day.
   */
  it("does not merge two runs hours apart", () => {
    const rows = [
      ...morning("2026-09-07T00:00:00Z", [{}, {}, {}, {}, {}, { errors: "529 overloaded" }]),
      ...morning("2026-09-07T06:09:00Z"),
    ];
    const batch = latestBatch(rows);
    expect(batch).toHaveLength(11);
    expect(batch.some((r) => r.errors)).toBe(false);
  });

  it("keeps eleven markets a minute apart together", () => {
    expect(latestBatch(morning("2026-09-07T00:00:00Z"))).toHaveLength(11);
  });

  it("returns nothing for no rows", () => {
    expect(latestBatch([])).toEqual([]);
  });

  it("does not care what order the rows arrive in", () => {
    const rows = morning("2026-09-07T00:00:00Z");
    expect(latestBatch([...rows].reverse())).toHaveLength(11);
  });
});

describe("summariseLatest", () => {
  it("reports the clean run, not the earlier failed one", () => {
    const rows = [
      ...morning("2026-09-07T00:00:00Z", [{}, {}, {}, {}, {}, { errors: "529", market: "Gulf" }]),
      ...morning("2026-09-07T06:09:00Z", Array.from({ length: 11 }, () => ({ itemsFound: 2 }))),
    ];
    const s = summariseLatest(rows);
    expect(s.failed).toEqual([]);
    expect(s.markets).toBe(11);
    expect(s.itemsFound).toBe(22);
  });

  it("names the market that failed", () => {
    const rows = morning("2026-09-07T00:00:00Z", [{ errors: "529", market: "Gulf (UAE + KSA)" }]);
    expect(summariseLatest(rows).failed).toEqual(["Gulf (UAE + KSA)"]);
  });

  it("counts refused findings without calling them failures", () => {
    const rows = morning("2026-09-07T00:00:00Z", [
      { dropped: 'Emaar: unknown signal code "H16" | Aldar: no usable source url' },
    ]);
    const s = summariseLatest(rows);
    expect(s.droppedCount).toBe(2);
    expect(s.failed).toEqual([]);
  });
});

describe("sweepWarning", () => {
  /** Silence is the right output for a healthy run. */
  it("says nothing when the run was clean", () => {
    expect(sweepWarning(summariseLatest(morning("2026-09-07T00:00:00Z")))).toBeNull();
  });

  it("says nothing when findings were merely refused", () => {
    // A sweep that found six, kept four and refused two did its job. This is
    // the case that used to read as "last sweep reported errors".
    const rows = morning("2026-09-07T00:00:00Z", [{ dropped: "Emaar: no usable source url" }]);
    expect(sweepWarning(summariseLatest(rows))).toBeNull();
  });

  it("names the failed market rather than saying something generic", () => {
    const rows = morning("2026-09-07T00:00:00Z", [{ errors: "529", market: "Gulf (UAE + KSA)" }]);
    expect(sweepWarning(summariseLatest(rows))).toBe("Gulf (UAE + KSA) did not sweep");
  });

  it("keeps the line short when several failed", () => {
    const rows = morning("2026-09-07T00:00:00Z", [
      { errors: "x", market: "India" }, { errors: "x", market: "UAE" },
      { errors: "x", market: "Saudi Arabia" }, { errors: "x", market: "Malaysia" },
    ]);
    expect(sweepWarning(summariseLatest(rows))).toBe("India, UAE +2 more did not sweep");
  });

  it("warns when the findings did not come from the live web", () => {
    const rows = morning("2026-09-07T00:00:00Z", [{ webSearchDegraded: true }]);
    expect(sweepWarning(summariseLatest(rows))).toContain("web search was unavailable");
  });

  it("prefers a hard failure over the search warning", () => {
    const rows = morning("2026-09-07T00:00:00Z", [
      { errors: "529", market: "Gulf", webSearchDegraded: true },
    ]);
    expect(sweepWarning(summariseLatest(rows))).toContain("did not sweep");
  });
});
