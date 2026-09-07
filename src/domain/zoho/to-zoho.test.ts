import { describe, expect, it } from "vitest";

import { LEAD_SOURCE, NO_NAMED_CONTACT } from "./fields";
import { assertNoContactData } from "./forbidden";
import {
  buildDeal, closingDateFor, dealName, packDealDescription, packLeadDescription,
  pushActionFor, splitPersonName, toDeal, toLead, zohoTargetFor,
} from "./to-zoho";
import type { SyncCard } from "./types";

const TODAY = new Date("2026-09-07T00:00:00Z");

const card = (over: Partial<SyncCard> = {}): SyncCard => ({
  id: "c1",
  account: "Emirates Group",
  country: "UAE",
  industry: "Aviation",
  practiceId: "hire",
  practiceName: "Hire (JobFit AI)",
  tower: "T2",
  partner: "Rahul Menon",
  stage: "Prospect",
  value: 300_000,
  dueOn: "",
  nextStep: "",
  evidence: "Cabin Crew Open Day announced",
  signalCode: "H3",
  url: "https://example.com/careers",
  contact: null,
  contactRole: "CHRO or Head of TA",
  zohoLeadId: null,
  zohoDealId: null,
  zohoAccountId: null,
  zohoContactId: null,
  ...over,
});

describe("zohoTargetFor", () => {
  it("sends Prospect to Leads and everything else to Deals (PRD §3)", () => {
    expect(zohoTargetFor("Prospect")).toBe("lead");
    for (const s of ["Plan reach-out", "Reached out", "In conversation",
                     "Meeting set", "Proposal", "Won", "Lost"] as const) {
      expect(zohoTargetFor(s), s).toBe("deal");
    }
  });
});

describe("pushActionFor", () => {
  it("covers the whole state machine", () => {
    const a = (stage: SyncCard["stage"], lead: string | null, deal: string | null) =>
      pushActionFor({ stage, zohoLeadId: lead, zohoDealId: deal });

    expect(a("Prospect", null, null)).toBe("CREATE_LEAD");
    expect(a("Prospect", "L1", null)).toBe("UPDATE_LEAD");
    expect(a("Plan reach-out", "L1", null)).toBe("CONVERT");
    // Quick-add opens straight at Plan reach-out (PRD §5), so there is no lead.
    expect(a("Plan reach-out", null, null)).toBe("CREATE_DEAL");
    expect(a("Proposal", "L1", "D1")).toBe("UPDATE_DEAL");
    expect(a("Proposal", null, "D1")).toBe("UPDATE_DEAL");
    // Demoted locally after conversion. Zoho has no un-convert.
    expect(a("Prospect", "L1", "D1")).toBe("DEMOTED");
  });
});

describe("dealName", () => {
  it("is {account} — {practice} (PRD §6)", () => {
    expect(dealName("Emirates Group", "Hire (JobFit AI)")).toBe("Emirates Group — Hire (JobFit AI)");
  });

  it("truncates rather than letting Zoho reject the record", () => {
    const out = dealName("x".repeat(200), "Hire (JobFit AI)");
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives an account name that already contains an em dash", () => {
    expect(dealName("Aldar — Properties", "Learn + Coach"))
      .toBe("Aldar — Properties — Learn + Coach");
  });
});

describe("closingDateFor", () => {
  it("uses the due date when there is one", () => {
    expect(closingDateFor({ dueOn: "2026-10-15" }, TODAY)).toBe("2026-10-15");
  });

  it("falls back to +90 days (PRD §6)", () => {
    expect(closingDateFor({ dueOn: "" }, TODAY)).toBe("2026-12-06");
  });

  it("never sends a date in the past, which would corrupt their forecast", () => {
    expect(closingDateFor({ dueOn: "2026-01-01" }, TODAY)).toBe("2026-09-07");
  });
});

describe("splitPersonName", () => {
  it("splits on the first space, keeping compound surnames whole", () => {
    expect(splitPersonName("Ravi Kumar Sharma")).toEqual({ first: "Ravi", last: "Kumar Sharma" });
    expect(splitPersonName("Maria de Souza")).toEqual({ first: "Maria", last: "de Souza" });
    expect(splitPersonName("O'Brien")).toEqual({ last: "O'Brien" });
  });

  it("uses the placeholder rather than inventing a surname", () => {
    expect(splitPersonName("")).toEqual({ last: NO_NAMED_CONTACT });
    expect(splitPersonName("   ")).toEqual({ last: NO_NAMED_CONTACT });
  });
});

describe("toLead", () => {
  it("carries a verified person's name and title", () => {
    const lead = toLead(card({ contact: { name: "Rashid Ahmed", title: "CHRO" } }));
    expect(lead.First_Name).toBe("Rashid");
    expect(lead.Last_Name).toBe("Ahmed");
    expect(lead.Designation).toBe("CHRO");
  });

  /** PRD §9.5 — a role is a job title we are aiming at, never a person. */
  it("never turns a target role into a name", () => {
    const lead = toLead(card({ contact: null, contactRole: "CHRO or Head of TA" }));
    expect(lead.Last_Name).toBe(NO_NAMED_CONTACT);
    expect(lead.First_Name).toBeUndefined();
    expect(lead.Designation).toBe("CHRO or Head of TA");
  });

  it("uses the PRD's Lead Source, not the prototype's", () => {
    expect(toLead(card()).Lead_Source).toBe("Growth Studio");
    expect(LEAD_SOURCE).not.toBe("Growth Engine");
  });

  it("emits nothing contact-shaped", () => {
    expect(() => assertNoContactData(toLead(card()), "toLead")).not.toThrow();
  });
});

describe("toDeal", () => {
  it("builds the PRD §6 shape", () => {
    const deal = toDeal(card({ stage: "Proposal", nextStep: "Send the pack" }), TODAY);
    expect(deal.Deal_Name).toBe("Emirates Group — Hire (JobFit AI)");
    expect(deal.Stage).toBe("Proposal/Price Quote");
    expect(deal.Amount).toBe(300_000);
    expect(deal.Next_Step).toBe("Send the pack");
    expect(deal.Lead_Source).toBe("Growth Studio");
  });

  /** The "only ever writes to records it created" invariant. */
  it("references the account by id only, never by name", () => {
    expect(toDeal(card({ stage: "Proposal" }), TODAY).Account_Name).toBeUndefined();
    expect(toDeal(card({ stage: "Proposal", zohoAccountId: "A1" }), TODAY).Account_Name)
      .toEqual({ id: "A1" });
  });

  it("only names a contact once one has actually been pushed", () => {
    const named = card({ stage: "Proposal", contact: { name: "Rashid Ahmed", title: "CHRO" } });
    expect(toDeal(named, TODAY).Contact_Name).toBeUndefined();
    expect(toDeal({ ...named, zohoContactId: "P1" }, TODAY).Contact_Name).toEqual({ id: "P1" });
  });
});

describe("descriptions", () => {
  it("packs the PRD §6 order for a lead", () => {
    expect(packLeadDescription(card()))
      .toBe("Hire (JobFit AI) · Cabin Crew Open Day announced · $300K · T2 · Rahul Menon");
  });

  it("leaves no dangling separator when fields are missing", () => {
    const sparse = packDealDescription(
      card({ evidence: "", signalCode: "", url: "", country: "", industry: "" }),
    );
    expect(sparse).toBe("T2 · Rahul Menon");
    expect(sparse.startsWith(" · ")).toBe(false);
    expect(sparse.endsWith(" · ")).toBe(false);
  });
});

describe("buildDeal — the currency boundary", () => {
  const rate = { usdToInr: 832_150, updatedAt: new Date("2026-09-06T00:00:00Z") };
  const ctx = { today: TODAY, base: "USD" as const, target: "INR" as const, rate };

  /**
   * The whole reason this exists: the connected Zoho org is in rupees, and a
   * $300,000 card pushed unconverted would sit in the client's CRM as
   * ₹300,000 — about $3,600 — with nothing about it looking wrong.
   */
  it("converts the Amount into the CRM's currency", () => {
    const r = buildDeal(card({ stage: "Proposal", value: 300_000 }), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.Amount).toBe(24_964_500);
    expect(r.payload.Amount).not.toBe(300_000);
  });

  it("leaves the Amount alone when the CRM is already in the base currency", () => {
    const r = buildDeal(card({ stage: "Proposal", value: 300_000 }), {
      ...ctx, target: "USD", rate: null,
    });
    expect(r.ok && r.payload.Amount).toBe(300_000);
  });

  it("REFUSES rather than shipping a wrong number when the rate is stale", () => {
    const r = buildDeal(card({ stage: "Proposal" }), {
      ...ctx, rate: { ...rate, updatedAt: new Date("2026-08-01T00:00:00Z") },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("stale-rate");
  });

  it("REFUSES when no rate is set at all", () => {
    const r = buildDeal(card({ stage: "Proposal" }), { ...ctx, rate: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no-rate");
  });

  it("keeps every other field identical to toDeal", () => {
    const c = card({ stage: "Meeting set", nextStep: "Send the pack", dueOn: "2026-11-01" });
    const built = buildDeal(c, ctx);
    const plain = toDeal(c, TODAY);
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    // Only the Amount differs — the conversion must not disturb the mapping.
    expect({ ...built.payload, Amount: 0 }).toEqual({ ...plain, Amount: 0 });
  });
});
