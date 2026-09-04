import { describe, expect, it } from "vitest";
import { amsWindows, dueNow, PARTNER_SILENCE_DAYS, withPartnerTooLong } from "./today";

const NOW = new Date("2026-09-02T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(NOW.getTime() - n * 86_400_000));
const inDays = (n: number) => iso(new Date(NOW.getTime() + n * 86_400_000));

const card = (over: Partial<Parameters<typeof dueNow>[0][number]> = {}) => ({
  id: "c1",
  account: "Emaar",
  stage: "Prospect",
  dueOn: "",
  dispatchedAt: "",
  next: "Draft the first note",
  partner: "Partner — T4",
  ...over,
});

describe("dueNow", () => {
  it("includes a card due today", () => {
    expect(dueNow([card({ dueOn: iso(NOW) })], NOW)).toHaveLength(1);
  });

  it("includes an overdue card", () => {
    expect(dueNow([card({ dueOn: daysAgo(5) })], NOW)).toHaveLength(1);
  });

  it("excludes a card due in the future", () => {
    expect(dueNow([card({ dueOn: inDays(3) })], NOW)).toHaveLength(0);
  });

  it("excludes a card with no due date at all", () => {
    expect(dueNow([card({ dueOn: "" })], NOW)).toHaveLength(0);
  });

  it("excludes Won and Lost — a closed card is never due", () => {
    expect(dueNow([card({ dueOn: daysAgo(1), stage: "Won" })], NOW)).toHaveLength(0);
    expect(dueNow([card({ dueOn: daysAgo(1), stage: "Lost" })], NOW)).toHaveLength(0);
  });

  it("puts the most overdue first — the oldest debt is the most urgent", () => {
    const out = dueNow(
      [card({ id: "recent", dueOn: daysAgo(1) }), card({ id: "old", dueOn: daysAgo(10) })],
      NOW,
    );
    expect(out.map((c) => c.id)).toEqual(["old", "recent"]);
  });
});

describe("withPartnerTooLong — PRD §5, red after 3 days", () => {
  it("excludes a packet dispatched today", () => {
    expect(withPartnerTooLong([card({ dispatchedAt: iso(NOW) })], NOW)).toHaveLength(0);
  });

  it("excludes a packet still inside the window", () => {
    expect(withPartnerTooLong([card({ dispatchedAt: daysAgo(PARTNER_SILENCE_DAYS) })], NOW)).toHaveLength(0);
  });

  it("includes a packet older than the window", () => {
    const out = withPartnerTooLong([card({ dispatchedAt: daysAgo(PARTNER_SILENCE_DAYS + 1) })], NOW);
    expect(out).toHaveLength(1);
    expect(out[0].daysWithPartner).toBe(PARTNER_SILENCE_DAYS + 1);
  });

  it("ignores cards never dispatched", () => {
    expect(withPartnerTooLong([card({ dispatchedAt: "" })], NOW)).toHaveLength(0);
  });

  it("ignores a closed card even if it was dispatched long ago", () => {
    expect(withPartnerTooLong([card({ dispatchedAt: daysAgo(30), stage: "Won" })], NOW)).toHaveLength(0);
  });

  it("uses the 3-day threshold the PRD states", () => {
    expect(PARTNER_SILENCE_DAYS).toBe(3);
  });
});

describe("amsWindows", () => {
  const target = (over = {}) => ({ name: "Tenaga", ams: false, inPipeline: false, score: 30, ...over });

  it("keeps only AMS rows", () => {
    const out = amsWindows([target({ ams: true }), target({ name: "Other", ams: false })]);
    expect(out.map((t) => t.name)).toEqual(["Tenaga"]);
  });

  it("drops an AMS row for an account already in conversation", () => {
    expect(amsWindows([target({ ams: true, inPipeline: true })])).toHaveLength(0);
  });
});

describe("withPartnerTooLong — the shape the database actually returns", () => {
  const card = (dispatchedAt: string) => ({
    id: "c1", account: "Emaar", stage: "Plan reach-out",
    dueOn: "2026-09-01", dispatchedAt, next: "packet with partner", partner: "Rahul",
  });

  /**
   * loadPipeline returns a timestamp column. dayOf used to build
   * `${iso}T00:00:00Z`, so a full ISO string parsed to NaN and the row vanished
   * from the list instead of failing loudly. The page separately passed "" for
   * every card, so this list could never populate at all.
   */
  it("counts the days when given a full ISO timestamp", () => {
    const rows = withPartnerTooLong([card("2026-09-01T10:22:00.000Z")], new Date("2026-09-08T00:00:00Z"));
    expect(rows).toHaveLength(1);
    expect(rows[0].daysWithPartner).toBe(7);
  });

  it("counts the days when given a plain date", () => {
    const rows = withPartnerTooLong([card("2026-09-01")], new Date("2026-09-08T00:00:00Z"));
    expect(rows[0].daysWithPartner).toBe(7);
  });

  it("still ignores a card that was never dispatched", () => {
    expect(withPartnerTooLong([card("")], new Date("2026-09-08T00:00:00Z"))).toHaveLength(0);
  });
});
