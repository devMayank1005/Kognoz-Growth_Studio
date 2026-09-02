import { describe, expect, it } from "vitest";
import { isDoNotContact } from "./dnc";

describe("isDoNotContact — PRD §8", () => {
  const list = ["Damac", "Acme Holdings", "  Spaced Co  "];

  it("blocks an exact match", () => {
    expect(isDoNotContact("Damac", list)).toBe(true);
  });

  it("blocks regardless of case — a list is not a spelling test", () => {
    expect(isDoNotContact("damac", list)).toBe(true);
    expect(isDoNotContact("DAMAC", list)).toBe(true);
    expect(isDoNotContact("DaMaC", list)).toBe(true);
  });

  it("ignores surrounding whitespace on either side", () => {
    expect(isDoNotContact("  Damac  ", list)).toBe(true);
    expect(isDoNotContact("Spaced Co", list)).toBe(true);
  });

  it("strips the radar 'NEW:' prefix before comparing", () => {
    // Radar finds arrive prefixed; a DNC company must not slip through
    // just because the sweep labelled it as new to us.
    expect(isDoNotContact("NEW: Damac", list)).toBe(true);
  });

  it("does not block a company that merely contains a blocked name", () => {
    // Substring matching would block legitimate, different companies.
    expect(isDoNotContact("Damac Properties Group", list)).toBe(false);
    expect(isDoNotContact("Acme", list)).toBe(false);
  });

  it("allows anything not on the list", () => {
    expect(isDoNotContact("Emaar", list)).toBe(false);
  });

  it("allows everything when the list is empty", () => {
    expect(isDoNotContact("Damac", [])).toBe(false);
  });

  it("treats an empty or missing name as not blocked rather than throwing", () => {
    expect(isDoNotContact("", list)).toBe(false);
    expect(isDoNotContact(undefined, list)).toBe(false);
  });
});
