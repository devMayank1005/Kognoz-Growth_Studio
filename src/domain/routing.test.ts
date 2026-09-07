import { describe, expect, it } from "vitest";
import { CORE_FLOOR, TIER_VALUE, WHALE_FLOOR, makeCard } from "./routing";

/** One crore, one lakh — the units the tiers are actually expressed in. */
const CR = 10_000_000;
const L = 100_000;

const PARTNERS = { T1: "Anita", T2: "Meera", T3: "Rahul", T4: "Sanjay" } as const;
const opts = (over = {}) => ({
  partnerOf: (t: keyof typeof PARTNERS) => PARTNERS[t],
  today: new Date("2026-09-02T00:00:00Z"),
  id: "card_test",
  ...over,
});

describe("makeCard — PRD acceptance criterion 3", () => {
  it("routes 'add Emaar for Hire at 3cr' to a Tagged T3 card worth ₹3Cr", () => {
    const card = makeCard(
      { company: "Emaar", solution: "Hire", value: 3 * CR },
      opts({ stage: "Plan reach-out" }),
    );

    expect(card.account).toBe("Emaar");
    expect(card.practice).toBe("Hire");
    expect(card.tower).toBe("T3");
    expect(card.partner).toBe("Rahul");
    expect(card.value).toBe(3 * CR);
    expect(card.tier).toBe("core");
    expect(card.stage).toBe("Plan reach-out");
  });
});

describe("makeCard — value tiers", () => {
  it.each([
    [5 * L, "wedge"],
    [CORE_FLOOR - 1, "wedge"],
    [CORE_FLOOR, "core"],
    [WHALE_FLOOR - 1, "core"],
    [WHALE_FLOOR, "whale"],
    [20 * CR, "whale"],
  ])("prices %i as %s", (value, tier) => {
    expect(makeCard({ company: "X", solution: "Hire", value }, opts()).tier).toBe(tier);
  });

  it("sets the whale flag only at or above the whale floor", () => {
    expect(makeCard({ company: "X", solution: "Hire", value: WHALE_FLOOR - 1 }, opts()).whale).toBe(false);
    expect(makeCard({ company: "X", solution: "Hire", value: WHALE_FLOOR }, opts()).whale).toBe(true);
  });

  it("defaults an unpriced row to the core value rather than zero", () => {
    const card = makeCard({ company: "X", solution: "Hire" }, opts());
    expect(card.value).toBe(TIER_VALUE.core);
    expect(card.tier).toBe("core");
  });

  /**
   * The thresholds are rupees now. A magnitude check is the only kind that
   * catches someone converting them back to dollars — an equality test against
   * the same literal would pass either way.
   */
  it("keeps the tier floors in crore", () => {
    expect(CORE_FLOOR).toBe(2.5 * CR);
    expect(WHALE_FLOOR).toBe(5 * CR);
    expect(TIER_VALUE.core).toBeGreaterThan(1 * CR);
  });
});

describe("makeCard — contact, per PRD §8", () => {
  it("formats a named contact as 'Name (Title)'", () => {
    const card = makeCard(
      { company: "X", solution: "Hire", contact_name: "Priya Rao", contact_title: "CHRO" },
      opts(),
    );
    expect(card.contact).toBe("Priya Rao (CHRO)");
  });

  it("falls back to the target role when no person is named", () => {
    const card = makeCard({ company: "X", solution: "Hire", contact_title: "CHRO" }, opts());
    expect(card.contact).toBe("CHRO");
  });

  it("leaves contact empty when neither is known", () => {
    expect(makeCard({ company: "X", solution: "Hire" }, opts()).contact).toBe("");
  });

  it("never produces a field carrying an email or phone", () => {
    const card = makeCard(
      { company: "X", solution: "Hire", contact_name: "Priya Rao", contact_title: "CHRO" },
      opts(),
    );
    expect(JSON.stringify(card)).not.toMatch(/@|\+\d{6,}/);
  });
});

describe("makeCard — stage drives the next step", () => {
  it("defaults to Prospect with a drafting next step and no due date", () => {
    const card = makeCard({ company: "X", solution: "Hire" }, opts());
    expect(card.stage).toBe("Prospect");
    expect(card.next).toBe("Draft the first note");
    expect(card.due).toBe("");
  });

  it("gives an operator-intent card a send step due in two days", () => {
    const card = makeCard({ company: "X", solution: "Hire" }, opts({ stage: "Plan reach-out" }));
    expect(card.next).toBe("Send the first note");
    expect(card.due).toBe("2026-09-04");
  });

  it("starts every card at zero touches and unsynced", () => {
    const card = makeCard({ company: "X", solution: "Hire" }, opts());
    expect(card.touches).toBe(0);
    expect(card.zohoSyncedAt).toBe("");
    expect(card.dispatchedAt).toBe("");
  });
});

describe("makeCard — solution parsing", () => {
  it("strips the product parenthetical from the practice name", () => {
    expect(makeCard({ company: "X", solution: "Hire (JobFit AI)" }, opts()).practice).toBe("Hire");
  });

  it("files an unrecognised solution under T1 rather than dropping the row", () => {
    const card = makeCard({ company: "X", solution: "Quantum Astrology" }, opts());
    expect(card.tower).toBe("T1");
    expect(card.partner).toBe("Anita");
  });

  it("strips a radar 'NEW:' prefix from the company name", () => {
    expect(makeCard({ company: "NEW: Lulu Group", solution: "Hire" }, opts()).account).toBe("Lulu Group");
  });
});
