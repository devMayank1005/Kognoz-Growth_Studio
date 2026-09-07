import { describe, expect, it } from "vitest";

import {
  assertNoContactData,
  assertNoContactShapedKeys,
  assertNoContactShapedValues,
  ContactDataError,
  CONTACT_SHAPED_KEY,
  CONTACT_SHAPED_VALUE,
} from "./forbidden";

describe("CONTACT_SHAPED_KEY", () => {
  it("catches the Zoho field names the original CI pattern missed", () => {
    // The old pattern was email|phone|mobile|address|linkedin|twitter|whatsapp,
    // so every name below reached the database unchallenged.
    for (const name of [
      "e_mail", "E-Mail", "Home_Phone", "Mailing_Street", "Mailing_Zip",
      "Other_Zip", "tel", "telephone", "msisdn", "Fax", "cell", "Skype_ID",
      "postcode",
    ]) {
      expect(CONTACT_SHAPED_KEY.test(name), name).toBe(true);
    }
  });

  it("still catches the ones it always did", () => {
    for (const name of ["email", "Secondary_Email", "phone", "Mobile", "mailing_address",
                        "LinkedIn", "twitter", "whatsapp"]) {
      expect(CONTACT_SHAPED_KEY.test(name), name).toBe(true);
    }
  });

  it("leaves this codebase's own column names alone", () => {
    // Every one of these exists or is planned. A false positive here fails CI
    // on a column that is perfectly compliant.
    for (const name of [
      "zoho_lead_id", "zoho_deal_id", "zoho_synced_at", "zoho_modified_at",
      "zoho_sync_error", "zoho_blocked_at", "zoho_bcc", "zoho_org_id",
      "org_id", "user_id", "messages_json", "payload_json", "signal_code",
      "next_step", "verified_at", "first_seen", "partner_user_id",
    ]) {
      expect(CONTACT_SHAPED_KEY.test(name), name).toBe(false);
    }
  });
});

describe("CONTACT_SHAPED_VALUE", () => {
  it("catches addresses and separated phone numbers", () => {
    for (const v of [
      "rashid.ahmed@emirates.com",
      "reach him on +971 50 123 4567",
      "+971-4-708-1234",
      "971 4 708 1234",
      "(+971) 4 708 1234",
    ]) {
      expect(CONTACT_SHAPED_VALUE.test(v), v).toBe(true);
    }
  });

  /**
   * The regression that broke every record on the first run: a Zoho id is an
   * unbroken 18-digit run, and the original pattern read it as a phone number.
   */
  it("does not treat an identifier or a date as a phone number", () => {
    for (const v of [
      "554023000000123456",       // a Zoho record id
      "554023000000999",
      "2026-09-05T11:22:33+05:30", // Modified_Time
      "2026-12-01",                // Closing_Date
      "300000",                    // Amount
      "f1c8e7e6-e609-4da9-9d60-c6add417a68e", // one of ours
    ]) {
      expect(CONTACT_SHAPED_VALUE.test(v), v).toBe(false);
    }
  });
});

describe("the assertions", () => {
  it("names the path of a forbidden key and never the value", () => {
    try {
      assertNoContactShapedKeys({ deal: { Contact: { Email: "a@b.cc" } } }, "test");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ContactDataError);
      const e = err as ContactDataError;
      expect(e.path).toBe("deal.Contact.Email");
      expect(e.kind).toBe("key");
      // The whole point: proving we caught the address must not print it.
      expect(e.message).not.toContain("a@b.cc");
    }
  });

  it("catches an address hiding under an innocent key", () => {
    expect(() => assertNoContactShapedValues({ note: "ping a@b.cc" }, "test"))
      .toThrow(ContactDataError);
  });

  it("passes a clean pulled deal", () => {
    expect(() =>
      assertNoContactData(
        { id: "554023000000123456", stage: "Needs Analysis", amount: 300000,
          modifiedTime: "2026-09-05T11:22:33+05:30" },
        "test",
      ),
    ).not.toThrow();
  });

  it("walks arrays as well as objects", () => {
    expect(() => assertNoContactData({ rows: [{ ok: 1 }, { Phone: "x" }] }, "test"))
      .toThrow(ContactDataError);
  });

  it("terminates on a cyclic object rather than hanging the sync", () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => assertNoContactData(cyclic, "test")).not.toThrow();
  });
});
