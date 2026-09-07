import { describe, expect, it } from "vitest";
import { canManageIntegrations, isAllowedEmailDomain, parseAllowedDomains } from "./access";

const ALLOWED = ["kognozconsulting.com"];

describe("isAllowedEmailDomain — the ordinary case", () => {
  it("allows the configured domain", () => {
    expect(isAllowedEmailDomain("mayank@kognozconsulting.com", ALLOWED)).toBe(true);
  });

  it("is case-insensitive on both the address and the list", () => {
    expect(isAllowedEmailDomain("MAYANK@KOGNOZCONSULTING.COM", ALLOWED)).toBe(true);
    expect(isAllowedEmailDomain("a@kognozconsulting.com", ["KognozConsulting.COM"])).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isAllowedEmailDomain("  a@kognozconsulting.com  ", ALLOWED)).toBe(true);
  });

  it("supports several configured domains", () => {
    expect(isAllowedEmailDomain("a@konverz.ai", ["kognozconsulting.com", "konverz.ai"])).toBe(true);
  });
});

describe("isAllowedEmailDomain — the near misses that matter", () => {
  it("rejects a domain that merely ENDS WITH the allowed one", () => {
    // A naive endsWith check lets an attacker register this and walk in.
    expect(isAllowedEmailDomain("a@evilkognozconsulting.com", ALLOWED)).toBe(false);
    expect(isAllowedEmailDomain("a@notkognozconsulting.com", ALLOWED)).toBe(false);
  });

  it("rejects a domain that merely STARTS WITH the allowed one", () => {
    expect(isAllowedEmailDomain("a@kognozconsulting.com.evil.com", ALLOWED)).toBe(false);
  });

  it("rejects a subdomain — it is not the same tenant", () => {
    expect(isAllowedEmailDomain("a@mail.kognozconsulting.com", ALLOWED)).toBe(false);
  });

  it("rejects the allowed domain appearing in the LOCAL part", () => {
    expect(isAllowedEmailDomain("kognozconsulting.com@evil.com", ALLOWED)).toBe(false);
  });

  it("rejects a malformed address with several @ signs rather than guessing", () => {
    expect(isAllowedEmailDomain("a@b@kognozconsulting.com", ALLOWED)).toBe(false);
  });

  it("rejects a trailing dot, which resolves to the same host but is not an exact match", () => {
    expect(isAllowedEmailDomain("a@kognozconsulting.com.", ALLOWED)).toBe(false);
  });
});

describe("isAllowedEmailDomain — fails closed", () => {
  it.each([["", "empty"], ["   ", "whitespace"], ["nodomain", "no @"], ["@kognozconsulting.com", "no local part"], ["a@", "no domain"]])(
    "rejects %j (%s)",
    (email) => {
      expect(isAllowedEmailDomain(email, ALLOWED)).toBe(false);
    },
  );

  it("rejects a missing address", () => {
    expect(isAllowedEmailDomain(undefined, ALLOWED)).toBe(false);
    expect(isAllowedEmailDomain(null, ALLOWED)).toBe(false);
  });

  it("rejects everything when no domains are configured — an empty allowlist admits nobody", () => {
    expect(isAllowedEmailDomain("a@kognozconsulting.com", [])).toBe(false);
  });
});

describe("parseAllowedDomains", () => {
  it("splits a comma-separated env value, trimming and lowercasing", () => {
    expect(parseAllowedDomains(" Kognozconsulting.com , konverz.ai ")).toEqual([
      "kognozconsulting.com",
      "konverz.ai",
    ]);
  });

  it("drops empty entries from trailing or doubled commas", () => {
    expect(parseAllowedDomains("kognozconsulting.com,,")).toEqual(["kognozconsulting.com"]);
  });

  it("returns an empty list for unset or blank config", () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains("")).toEqual([]);
    expect(parseAllowedDomains("   ")).toEqual([]);
  });

  it("strips a leading @ if someone writes the value as @domain.com", () => {
    expect(parseAllowedDomains("@kognozconsulting.com")).toEqual(["kognozconsulting.com"]);
  });
});

describe("canManageIntegrations", () => {
  it("lets operators connect, because that is the role everyone actually has", () => {
    // DEFAULT_ROLE is "operator" and nothing writes "admin"; gating on admin
    // alone would lock out every existing user, founder included.
    expect(canManageIntegrations("operator")).toBe(true);
    expect(canManageIntegrations("admin")).toBe(true);
  });

  it("keeps partners and viewers out — connecting acts on the live CRM", () => {
    expect(canManageIntegrations("partner")).toBe(false);
    expect(canManageIntegrations("viewer")).toBe(false);
  });

  it("fails closed on anything unrecognised", () => {
    for (const r of ["", "Admin", "OPERATOR", "superuser"]) {
      expect(canManageIntegrations(r), r).toBe(false);
    }
  });
});
