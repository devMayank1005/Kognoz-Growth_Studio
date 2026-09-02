import { describe, expect, it } from "vitest";
import { INDUSTRIES, industryOf } from "./industry";

describe("industryOf", () => {
  it.each([
    ["private sector bank", "Banking"],
    ["life insurer", "Insurance"],
    ["NBFC lender", "NBFC & Finance"],
    ["fintech payments", "NBFC & Finance"],
    ["BPO / GBS", "BPO / GCC / IT"],
    ["captive GCC", "BPO / GCC / IT"],
    ["QSR frontline", "Retail & QSR"],
    ["FMCG consumer", "Retail & QSR"],
    ["property developer", "Real Estate"],
    ["oil and gas major", "Industrial & Energy"],
    ["giga-project", "Industrial & Energy"],
    ["airline", "Industrial & Energy"],
    ["pharma manufacturer", "Pharma & Health"],
    ["hospital network", "Pharma & Health"],
    ["telecom operator", "Telecom & Tech"],
    ["family conglomerate", "Conglomerate & Family"],
    ["Malaysian GLC", "Conglomerate & Family"],
  ])("maps %j to %j", (segment, expected) => {
    expect(industryOf(segment)).toBe(expected);
  });

  it("prefers Pharma & Health over Industrial & Energy when both could match", () => {
    // "manufactur" and "plant" belong to Industrial, but a pharma plant is pharma.
    expect(industryOf("pharma manufacturer")).toBe("Pharma & Health");
    expect(industryOf("hospital infrastructure")).toBe("Pharma & Health");
  });

  it("still files genuinely industrial segments as Industrial & Energy", () => {
    expect(industryOf("steel plant")).toBe("Industrial & Energy");
    expect(industryOf("auto manufacturing")).toBe("Industrial & Energy");
  });

  it("falls back to Other for an unrecognised segment", () => {
    expect(industryOf("municipal water board")).toBe("Other");
  });

  it("treats empty and nullish input as Other rather than throwing", () => {
    expect(industryOf("")).toBe("Other");
    expect(industryOf(undefined)).toBe("Other");
  });

  it("is case-insensitive", () => {
    expect(industryOf("BANK")).toBe("Banking");
  });

  it("only ever returns a value from the published bucket list", () => {
    const samples = ["bank", "insur", "nbfc", "gcc", "retail", "property", "energy", "pharma", "telecom", "family", "nonsense"];
    for (const s of samples) expect(INDUSTRIES).toContain(industryOf(s));
  });
});
