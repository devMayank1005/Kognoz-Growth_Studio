import { describe, expect, it } from "vitest";
import { AMS_SCORE, FRESHNESS_WEIGHT, RADAR_GRACE_DAYS, RELATIONSHIP_WEIGHT, rankTargets, scoreTarget } from "./scoring";

const NOW = new Date("2026-09-02T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString().slice(0, 10);

describe("scoreTarget — PRD §4.3 formula", () => {
  it("scores a brand-new tier-1 signal that landed today at 40 + 35 + 12", () => {
    expect(scoreTarget({ signalCode: "H1", ageDays: 0, relationship: "new" })).toBeCloseTo(87, 5);
  });

  it("halves the freshness component at the window midpoint", () => {
    // H1 window is 42 days; watch relationship is 5.
    expect(scoreTarget({ signalCode: "H1", ageDays: 21, relationship: "watch" })).toBeCloseTo(22 + 17.5 + 5 - 22 + 40, 5);
  });

  it("weights tier 2 below tier 1 for the same age and relationship", () => {
    const t1 = scoreTarget({ signalCode: "H1", ageDays: 0, relationship: "watch" });
    const t2 = scoreTarget({ signalCode: "H8", ageDays: 0, relationship: "watch" });
    expect(t1).toBeGreaterThan(t2);
    expect(t1 - t2).toBe(40 - 22);
  });

  it("ranks a client below a new logo, per the 70/30 new-to-expand mix", () => {
    const asNew = scoreTarget({ signalCode: "H1", ageDays: 0, relationship: "new" });
    const asClient = scoreTarget({ signalCode: "H1", ageDays: 0, relationship: "client" });
    expect(asNew - asClient).toBe(RELATIONSHIP_WEIGHT.new - RELATIONSHIP_WEIGHT.client);
  });

  it("drops the freshness component to zero once the window has run", () => {
    expect(scoreTarget({ signalCode: "H1", ageDays: 42, relationship: "watch" })).toBe(40 + 0 + 5);
  });

  it("treats a radar find with no signal as tier 3", () => {
    expect(scoreTarget({ signalCode: "", ageDays: 0, relationship: "new" })).toBe(8 + 0 + 12);
  });

  it("exposes the freshness weight the PRD fixes at 35", () => {
    expect(FRESHNESS_WEIGHT).toBe(35);
  });
});

describe("rankTargets", () => {
  const universe = [
    { name: "Emaar", country: "UAE", segment: "property developer", status: "prospect" as const },
    { name: "HDFC Bank", country: "India", segment: "private bank", status: "client" as const },
    { name: "Bangkok Bank", country: "Thailand", segment: "bank", status: "prospect" as const },
  ];

  it("returns one row per account, sorted by score descending", () => {
    const out = rankTargets({
      items: [
        { account: "Emaar", signal: "H10", date: daysAgo(20) },
        { account: "HDFC Bank", signal: "H1", date: daysAgo(0) },
      ],
      universe,
      now: NOW,
    });
    expect(out.map((t) => t.name)).toEqual(["HDFC Bank", "Emaar"]);
    expect(out[0].score).toBeGreaterThan(out[1].score);
  });

  it("keeps only the best-scoring signal when an account has several", () => {
    const out = rankTargets({
      items: [
        { account: "Emaar", signal: "H10", date: daysAgo(20) }, // tier 3, stale
        { account: "Emaar", signal: "H1", date: daysAgo(1) },   // tier 1, fresh
      ],
      universe,
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].signal).toBe("H1");
  });

  it("routes a signal to the tower whose practice owns it", () => {
    const out = rankTargets({ items: [{ account: "Emaar", signal: "H1", date: daysAgo(1) }], universe, now: NOW });
    expect(out[0].tower).toBe("T3");
  });

  it("marks a known client as a client and an unknown company as new", () => {
    const out = rankTargets({
      items: [
        { account: "HDFC Bank", signal: "H1", date: daysAgo(1) },
        { account: "Some Unknown Co", signal: "H1", date: daysAgo(1) },
      ],
      universe,
      now: NOW,
    });
    expect(out.find((t) => t.name === "HDFC Bank")!.relationship).toBe("client");
    expect(out.find((t) => t.name === "Some Unknown Co")!.relationship).toBe("new");
  });

  it("blocks a do-not-contact company from ever being ranked", () => {
    const out = rankTargets({
      items: [{ account: "Emaar", signal: "H1", date: daysAgo(1) }],
      universe,
      dnc: ["Emaar"],
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("drops benched markets — Thailand and Qatar are out of scope", () => {
    const out = rankTargets({
      items: [{ account: "Bangkok Bank", signal: "H1", date: daysAgo(1) }],
      universe,
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("flags an account that already has a live pipeline card", () => {
    const out = rankTargets({
      items: [{ account: "Emaar", signal: "H1", date: daysAgo(1) }],
      universe,
      pipeline: [{ account: "Emaar", stage: "In conversation" }],
      now: NOW,
    });
    expect(out[0].inPipeline).toBe(true);
  });

  it("does not treat a Won or Lost card as a live thread", () => {
    const out = rankTargets({
      items: [{ account: "Emaar", signal: "H1", date: daysAgo(1) }],
      universe,
      pipeline: [{ account: "Emaar", stage: "Won" }],
      now: NOW,
    });
    expect(out[0].inPipeline).toBe(false);
  });
});

describe("rankTargets — the AMS play (PRD §4.2)", () => {
  const universe = [{ name: "Tata Motors", country: "India", segment: "auto", status: "prospect" as const }];

  it("resurfaces an L6 go-live that is 6-18 months old as an AMS row", () => {
    const out = rankTargets({
      items: [],
      universe,
      history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(300) }],
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].ams).toBe(true);
  });

  it("pins every AMS row to a fixed score of 30", () => {
    const out = rankTargets({
      items: [],
      universe,
      history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(300) }],
      now: NOW,
    });
    expect(out[0].score).toBe(AMS_SCORE);
  });

  it("routes the AMS play to T2, the Darwinbox tower that runs the motion", () => {
    const out = rankTargets({
      items: [],
      universe,
      history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(300) }],
      now: NOW,
    });
    expect(out[0].tower).toBe("T2");
  });

  it("stays quiet before 180 days and after 540 days", () => {
    const early = rankTargets({ items: [], universe, history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(100) }], now: NOW });
    const late = rankTargets({ items: [], universe, history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(700) }], now: NOW });
    expect(early).toEqual([]);
    expect(late).toEqual([]);
  });

  it("does not raise an AMS row for an account already in live conversation", () => {
    const out = rankTargets({
      items: [],
      universe,
      history: [{ account: "Tata Motors", signal: "L6", date: daysAgo(300) }],
      pipeline: [{ account: "Tata Motors", stage: "Meeting set" }],
      now: NOW,
    });
    expect(out).toEqual([]);
  });
});

describe("rankTargets — radar finds", () => {
  it("carries a recent radar find with no live signal for 14 days", () => {
    const out = rankTargets({
      items: [],
      universe: [{ name: "Lulu Group", country: "UAE", segment: "retail", status: "discovered" as const, firstSeen: daysAgo(3) }],
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].radarOnly).toBe(true);
    expect(out[0].relationship).toBe("new");
  });

  it("drops a radar find once the grace period has passed", () => {
    const out = rankTargets({
      items: [],
      universe: [{ name: "Lulu Group", country: "UAE", segment: "retail", status: "discovered" as const, firstSeen: daysAgo(RADAR_GRACE_DAYS + 1) }],
      now: NOW,
    });
    expect(out).toEqual([]);
  });

  it("prefers a real signal over the bare radar row for the same account", () => {
    const out = rankTargets({
      items: [{ account: "Lulu Group", signal: "H1", date: daysAgo(1) }],
      universe: [{ name: "Lulu Group", country: "UAE", segment: "retail", status: "discovered" as const, firstSeen: daysAgo(3) }],
      now: NOW,
    });
    expect(out).toHaveLength(1);
    expect(out[0].radarOnly).toBeFalsy();
    expect(out[0].signal).toBe("H1");
  });
});
