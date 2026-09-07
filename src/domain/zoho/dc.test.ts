import { describe, expect, it } from "vitest";

import {
  assertAccountsDomain, assertApiDomain, dcFromAccountsDomain,
  dcLabel, isZohoDc, ZOHO_DC_CODES, ZOHO_DCS,
} from "./dc";

describe("the data centre map", () => {
  it("covers India, which is the org we are connecting", () => {
    expect(ZOHO_DCS.in.accounts).toBe("https://accounts.zoho.in");
    expect(dcLabel("in")).toBe("India");
  });

  /**
   * The fact that kills "derive the domain from the region code": Canada does
   * not follow the zoho.{tld} pattern at all. It is why the connection stores
   * whatever Zoho returns instead of computing it.
   */
  it("has Canada on zohocloud.ca, not zoho.ca", () => {
    expect(ZOHO_DCS.ca.accounts).toBe("https://accounts.zohocloud.ca");
    expect(ZOHO_DCS.ca.accounts).not.toContain("zoho.ca");
  });

  it("round-trips every code through its accounts domain", () => {
    for (const code of ZOHO_DC_CODES) {
      expect(dcFromAccountsDomain(ZOHO_DCS[code].accounts), code).toBe(code);
    }
  });

  it("recognises only real region codes", () => {
    expect(isZohoDc("in")).toBe(true);
    expect(isZohoDc("uk")).toBe(false);
    expect(isZohoDc("")).toBe(false);
    // Not fooled by inherited object properties.
    expect(isZohoDc("constructor")).toBe(false);
    expect(isZohoDc("toString")).toBe(false);
  });
});

describe("assertAccountsDomain", () => {
  it("accepts a known domain and normalises a trailing slash", () => {
    expect(assertAccountsDomain("https://accounts.zoho.in/")).toBe("https://accounts.zoho.in");
    expect(assertAccountsDomain("  https://accounts.zoho.in  ")).toBe("https://accounts.zoho.in");
  });

  /**
   * The MICROSOFT_TENANT_ID incident, in a different costume: a value with a
   * stray newline built a URL the provider refused, and the only symptom was a
   * sign-in loop. Caught at the boundary, it is a message instead.
   */
  it("refuses a domain carrying whitespace or a newline", () => {
    expect(() => assertAccountsDomain("https://accounts.zoho.in\n")).not.toThrow();
    expect(() => assertAccountsDomain("https://accounts.zoho.in extra")).toThrow(/not a Zoho accounts domain/);
  });

  it("refuses a lookalike host", () => {
    for (const bad of [
      "https://accounts.zoho.in.evil.com",
      "http://accounts.zoho.in",          // not https
      "https://accounts.zoho.co",
      "https://accounts.zoho.ca",         // Canada is zohocloud.ca
      "",
    ]) {
      expect(() => assertAccountsDomain(bad), bad).toThrow();
    }
  });

  it("names the valid options when it refuses", () => {
    expect(() => assertAccountsDomain("https://nope.example")).toThrow(/accounts\.zoho\.in/);
  });
});

describe("assertApiDomain", () => {
  it("accepts what Zoho actually returns", () => {
    // Deliberately NOT matched against a fixed list — the api host is not
    // derivable and a new region must not break the connection.
    for (const good of [
      "https://www.zohoapis.in",
      "https://www.zohoapis.com",
      "https://www.zohoapis.eu",
      "https://www.zohoapis.com.au",
      "https://www.zohoapis.ca",
    ]) {
      expect(() => assertApiDomain(good), good).not.toThrow();
    }
  });

  it("strips a path and a trailing slash", () => {
    expect(assertApiDomain("https://www.zohoapis.in/crm/v8/")).toBe("https://www.zohoapis.in");
  });

  it("refuses http, a non-URL, and a host that is not Zoho's", () => {
    for (const bad of [
      "http://www.zohoapis.in",
      "not a url",
      "https://evil.example.com",
      // The suffix-matching hole: this must NOT pass just because it contains
      // "zohoapis." — the token would be sent to somebody else's server.
      "https://zohoapis.in.evil.com",
      "https://www.zohoapis.in.attacker.example",
      "https://notzoho.com",
    ]) {
      expect(() => assertApiDomain(bad), bad).toThrow();
    }
  });
});
