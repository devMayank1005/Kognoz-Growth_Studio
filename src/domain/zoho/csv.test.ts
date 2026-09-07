import { describe, expect, it } from "vitest";

import { DEAL_COLUMNS, dealsCsv, LEAD_COLUMNS, leadsCsv, splitForExport } from "./csv";
import { LEAD_SOURCE } from "./fields";
import { toDeal, toLead } from "./to-zoho";
import type { SyncCard } from "./types";

const TODAY = new Date("2026-09-07T00:00:00Z");

const card = (over: Partial<SyncCard> = {}): SyncCard => ({
  id: "c1", account: "Emirates Group", country: "UAE", industry: "Aviation",
  practiceId: "hire", practiceName: "Hire (JobFit AI)", tower: "T2",
  partner: "Rahul Menon", stage: "Prospect", value: 300_000, dueOn: "",
  nextStep: "", evidence: "Cabin Crew Open Day", signalCode: "H3",
  url: "https://example.com", contact: null, contactRole: "CHRO",
  zohoLeadId: null, zohoDealId: null, zohoAccountId: null, zohoContactId: null,
  ...over,
});

describe("splitForExport", () => {
  it("sends Prospect to leads and the rest to deals (PRD §3)", () => {
    const { leads, deals } = splitForExport([
      card({ id: "a", stage: "Prospect" }),
      card({ id: "b", stage: "Proposal" }),
      card({ id: "c", stage: "Won" }),
    ]);
    expect(leads.map((c) => c.id)).toEqual(["a"]);
    expect(deals.map((c) => c.id)).toEqual(["b", "c"]);
  });
});

describe("the import files", () => {
  it("keeps Zoho's column order — a reordered file misimports", () => {
    expect(leadsCsv([]).split("\r\n")[0]).toBe(LEAD_COLUMNS.join(","));
    expect(dealsCsv([], TODAY).split("\r\n")[0]).toBe(DEAL_COLUMNS.join(","));
  });

  it("quotes a company name containing a comma, a quote, or a newline", () => {
    // "Aldar Properties, PJSC" is the shape of the real data, not a corner case.
    const line = leadsCsv([card({ account: 'Aldar Properties, "PJSC"\nDubai' })]).split("\r\n")[1];
    expect(line).toContain('"Aldar Properties, ""PJSC""\nDubai"');
  });

  it("uses CRLF, because these get opened in Excel", () => {
    expect(leadsCsv([card()])).toContain("\r\n");
    expect(leadsCsv([card()]).endsWith("\r\n")).toBe(true);
  });
});

describe("the CSV and the API cannot drift", () => {
  /**
   * The specific failure the prototype invited: it had Lead Source typed out in
   * four separate places. Both paths now come from one builder.
   */
  it("writes the same Lead Source both ways", () => {
    const c = card();
    expect(leadsCsv([c])).toContain(LEAD_SOURCE);
    expect(toLead(c).Lead_Source).toBe(LEAD_SOURCE);
    expect(dealsCsv([card({ stage: "Proposal" })], TODAY)).toContain(LEAD_SOURCE);
    expect(toDeal(card({ stage: "Proposal" }), TODAY).Lead_Source).toBe(LEAD_SOURCE);
  });

  it("writes the same stage, name and closing date both ways", () => {
    const c = card({ stage: "Meeting set", dueOn: "2026-11-01" });
    const deal = toDeal(c, TODAY);
    const line = dealsCsv([c], TODAY).split("\r\n")[1];
    expect(line).toContain(deal.Deal_Name);
    expect(line).toContain(deal.Stage);
    expect(line).toContain(deal.Closing_Date);
  });

  it("honours a client's own Lead Source override in both paths", () => {
    expect(leadsCsv([card()], "Partner Referral")).toContain("Partner Referral");
    expect(toLead(card(), "Partner Referral").Lead_Source).toBe("Partner Referral");
  });
});

describe("what the files must never contain", () => {
  it("names a person only when one is verified", () => {
    const withRole = leadsCsv([card({ contact: null, contactRole: "CHRO or Head of TA" })]);
    expect(withRole).toContain("(no named contact)");
    expect(withRole).toContain("CHRO or Head of TA");   // as Designation, not as a name

    const named = leadsCsv([card({ contact: { name: "Rashid Ahmed", title: "CHRO" } })]);
    expect(named).toContain("Rashid,Ahmed");
  });

  it("carries no email or phone column at all (PRD §8)", () => {
    for (const col of [...LEAD_COLUMNS, ...DEAL_COLUMNS]) {
      expect(/email|phone|mobile/i.test(col), col).toBe(false);
    }
  });
});
