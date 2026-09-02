import { describe, expect, it } from "vitest";
import { makeCard } from "./routing";

const PARTNERS = { T1: "Anita", T2: "Meera", T3: "Rahul", T4: "Sanjay" } as const;
const opts = (over = {}) => ({
  partnerOf: (t: keyof typeof PARTNERS) => PARTNERS[t],
  today: new Date("2026-09-02T00:00:00Z"),
  id: "card_test",
  ...over,
});

describe("makeCard — PRD acceptance criterion 3", () => {
  it("routes 'add Emaar for Hire at 300K' to a Tagged T3 card worth $300K", () => {
    const card = makeCard(
      { company: "Emaar", solution: "Hire", value: 300_000 },
      opts({ stage: "Plan reach-out" }),
    );

    expect(card.account).toBe("Emaar");
    expect(card.practice).toBe("Hire");
    expect(card.tower).toBe("T3");
    expect(card.partner).toBe("Rahul");
    expect(card.value).toBe(300_000);
    expect(card.tier).toBe("core");
    expect(card.stage).toBe("Plan reach-out");
  });
});

describe("makeCard — value tiers", () => {
  it.each([
    [50_000, "wedge"],
    [249_999, "wedge"],
    [250_000, "core"],
    [499_999, "core"],
    [500_000, "whale"],
    [2_000_000, "whale"],
  ])("prices $%i as %s", (value, tier) => {
    expect(makeCard({ company: "X", solution: "Hire", value }, opts()).tier).toBe(tier);
  });

  it("sets the whale flag only at or above $500K", () => {
    expect(makeCard({ company: "X", solution: "Hire", value: 499_999 }, opts()).whale).toBe(false);
    expect(makeCard({ company: "X", solution: "Hire", value: 500_000 }, opts()).whale).toBe(true);
  });

  it("defaults an unpriced row to the core value rather than zero", () => {
    const card = makeCard({ company: "X", solution: "Hire" }, opts());
    expect(card.value).toBe(300_000);
    expect(card.tier).toBe("core");
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
