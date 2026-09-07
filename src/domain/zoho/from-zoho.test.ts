import { describe, expect, it } from "vitest";

import { PULLED_DEAL_FIELDS } from "./fields";
import { CONTACT_SHAPED_KEY, CONTACT_SHAPED_VALUE } from "./forbidden";
import { parsePulledDeal } from "./from-zoho";

/**
 * A realistic Zoho Deal response, with everything Zoho actually sends back that
 * PRD §8 forbids us from keeping. This fixture is the test — if the boundary
 * ever loosens, these assertions are what catches it.
 */
const DIRTY_ZOHO_DEAL = {
  id: "554023000000123456",
  Deal_Name: "Emirates Group — Hire (JobFit AI)",
  Stage: "Needs Analysis",
  Amount: 300000,
  Modified_Time: "2026-09-05T11:22:33+05:30",
  Closing_Date: "2026-12-01",
  Email: "rashid.ahmed@emirates.com",
  Secondary_Email: "r.ahmed@personal.example",
  Phone: "+971 4 708 1234",
  Mobile: "+971 50 123 4567",
  Home_Phone: "+971 4 000 0000",
  Fax: "+971 4 111 1111",
  Mailing_Street: "Emirates Group HQ, Airport Road",
  Mailing_Zip: "686",
  Twitter: "@emirates",
  LinkedIn: "https://linkedin.com/in/someone",
  Skype_ID: "live:someone",
  Description: "Cabin crew open day",
  Contact_Name: {
    id: "554023000000999",
    name: "Rashid Ahmed",
    Email: "rashid.ahmed@emirates.com",
    Phone: "+971 50 999 8888",
  },
  Owner: { id: "1", name: "Mayank", email: "mayank@kognoz.example" },
};

describe("parsePulledDeal — the PRD §8 boundary", () => {
  it("keeps EXACTLY the four permitted fields, not merely a superset", () => {
    const out = parsePulledDeal(DIRTY_ZOHO_DEAL);
    expect(out.ok).toBe(true);
    if (!out.ok) return;

    // Set equality. A superset check would pass while leaking Email.
    expect(Object.keys(out.deal).sort()).toEqual(["amount", "id", "modifiedTime", "stage"]);
    expect(PULLED_DEAL_FIELDS).toHaveLength(4);
  });

  it("lets no contact-shaped KEY through, using the pattern CI enforces", () => {
    const out = parsePulledDeal(DIRTY_ZOHO_DEAL);
    if (!out.ok) throw new Error("expected a parse");
    for (const key of Object.keys(out.deal)) {
      expect(CONTACT_SHAPED_KEY.test(key), key).toBe(false);
    }
  });

  it("lets no address or phone number through as a VALUE", () => {
    const out = parsePulledDeal(DIRTY_ZOHO_DEAL);
    if (!out.ok) throw new Error("expected a parse");
    // The value check is what catches an address arriving under an innocent key.
    expect(CONTACT_SHAPED_VALUE.test(JSON.stringify(out.deal))).toBe(false);
  });

  it("drops the nested Contact_Name object entirely", () => {
    const out = parsePulledDeal(DIRTY_ZOHO_DEAL);
    if (!out.ok) throw new Error("expected a parse");
    const flat = JSON.stringify(out.deal);
    for (const leaked of ["Rashid", "emirates.com", "971", "Airport Road", "linkedin"]) {
      expect(flat, leaked).not.toContain(leaked);
    }
  });

  it("keeps nothing extra however deeply the response is nested", () => {
    // Stands in for a generative test: arbitrary shapes, same guarantee.
    const shapes: unknown[] = [
      { ...DIRTY_ZOHO_DEAL, extra: { a: { b: { c: "x@y.zz" } } } },
      { ...DIRTY_ZOHO_DEAL, list: [{ Email: "a@b.cc" }, { Phone: "+971 50 000 0000" }] },
      { ...DIRTY_ZOHO_DEAL, $approval: { delegate: false }, $editable: true },
    ];
    for (const shape of shapes) {
      const out = parsePulledDeal(shape);
      if (!out.ok) throw new Error("expected a parse");
      expect(Object.keys(out.deal).sort()).toEqual(["amount", "id", "modifiedTime", "stage"]);
    }
  });

  it("reports how much it dropped, so a silent boundary is visible", () => {
    const out = parsePulledDeal(DIRTY_ZOHO_DEAL);
    if (!out.ok) throw new Error("expected a parse");
    expect(out.droppedKeys).toBeGreaterThan(10);
  });
});

describe("parsePulledDeal — refusals", () => {
  it("refuses a record with no usable Modified_Time", () => {
    // It is the watermark last-write-wins rests on. Treating a missing one as
    // "never modified" would let a remote edit win forever.
    expect(parsePulledDeal({ id: "1", Stage: "Qualification" })).toEqual({
      ok: false,
      reason: "bad-modified-time",
    });
    expect(parsePulledDeal({ id: "1", Modified_Time: "not a date" })).toEqual({
      ok: false,
      reason: "bad-modified-time",
    });
  });

  it("refuses a record with no id", () => {
    expect(parsePulledDeal({ Modified_Time: "2026-09-05T00:00:00Z" })).toEqual({
      ok: false,
      reason: "no-id",
    });
  });

  it("refuses anything that is not an object", () => {
    for (const v of [null, undefined, "x", 3, []]) {
      expect(parsePulledDeal(v).ok).toBe(false);
    }
  });

  it("reads Amount whether Zoho sends a number, a numeric string, or null", () => {
    const base = { id: "1", Stage: "Qualification", Modified_Time: "2026-09-05T00:00:00Z" };
    const amount = (Amount: unknown) => {
      const out = parsePulledDeal({ ...base, Amount });
      return out.ok ? out.deal.amount : "refused";
    };
    expect(amount(300000)).toBe(300000);
    expect(amount("300000")).toBe(300000);
    expect(amount(null)).toBeNull();
    expect(amount("")).toBeNull();
    expect(amount("not a number")).toBeNull();
  });
});
