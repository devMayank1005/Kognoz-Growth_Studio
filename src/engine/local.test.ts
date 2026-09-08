import { describe, expect, it } from "vitest";
import { matchIntent, parseMoney } from "./local";

describe("parseMoney", () => {
  it.each([
    ["300K", 300_000],
    ["300k", 300_000],
    ["$300K", 300_000],
    ["1.5M", 1_500_000],
    ["2m", 2_000_000],
    ["300000", 300_000],
    ["$75,000", 75_000],
  ])("reads %j as %i", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it("returns undefined for something that is not money", () => {
    expect(parseMoney("soon")).toBeUndefined();
    expect(parseMoney("")).toBeUndefined();
  });
});

describe("matchIntent — pipeline", () => {
  it.each(["pipeline", "Pipeline", "  pipeline  ", "how's the pipeline?", "how is my pipeline"])(
    "treats %j as the pipeline intent",
    (q) => {
      expect(matchIntent(q)).toMatchObject({ kind: "pipeline" });
    },
  );

  it.each([
    ["pipeline by geography", "geography"],
    ["pipeline by stage", "stage"],
    ["pipeline by solution", "solution"],
    ["pipeline by practice", "practice"],
  ])("reads %j as grouped by %s", (q, groupBy) => {
    expect(matchIntent(q)).toMatchObject({ kind: "pipeline", groupBy });
  });
});

describe("matchIntent — due and open-first", () => {
  it.each(["what's due today", "due today", "follow ups", "follow-ups"])("%j is the due intent", (q) => {
    expect(matchIntent(q)).toMatchObject({ kind: "due" });
  });

  it.each(["who should I open first", "open first", "top leads", "best leads today"])(
    "%j is the open-first intent",
    (q) => {
      expect(matchIntent(q)).toMatchObject({ kind: "openFirst" });
    },
  );
});

describe("matchIntent — market", () => {
  it("reads the market out of the question", () => {
    expect(matchIntent("what's moving in UAE")).toMatchObject({ kind: "market", market: "UAE" });
    expect(matchIntent("what's happening in India")).toMatchObject({ kind: "market", market: "India" });
  });

  it("maps the aliases the operator actually types", () => {
    expect(matchIntent("what's moving in dubai")).toMatchObject({ market: "UAE" });
    expect(matchIntent("what's moving in KSA")).toMatchObject({ market: "Saudi Arabia" });
    expect(matchIntent("what's moving in saudi")).toMatchObject({ market: "Saudi Arabia" });
  });

  it("defers to the model when the question wants research rather than the local view", () => {
    // These need web search and synthesis — answering locally would be wrong.
    expect(matchIntent("what's the latest news in UAE")).toBeNull();
    expect(matchIntent("read the pattern in UAE")).toBeNull();
  });

  it("does not fire for a benched market", () => {
    expect(matchIntent("what's moving in Thailand")).toBeNull();
  });
});

describe("matchIntent — add (PRD acceptance criterion 3)", () => {
  it("parses 'add Emaar for Hire at 300K' completely", () => {
    expect(matchIntent("add Emaar for Hire at 300K")).toEqual({
      kind: "add",
      company: "Emaar",
      solution: "Hire",
      value: 300_000,
    });
  });

  it("accepts a bare company", () => {
    expect(matchIntent("add Emaar")).toEqual({
      kind: "add",
      company: "Emaar",
      solution: undefined,
      value: undefined,
    });
  });

  it("accepts a multi-word company and a large value", () => {
    expect(matchIntent("add Lulu Group for Skills AI at 1.5M")).toEqual({
      kind: "add",
      company: "Lulu Group",
      solution: "Skills AI",
      value: 1_500_000,
    });
  });

  it("accepts a value without a solution", () => {
    expect(matchIntent("add NEOM at 500k")).toMatchObject({ company: "NEOM", value: 500_000 });
  });

  it("does not hijack ordinary sentences that begin with 'add'", () => {
    // "add a note", "add more detail" are conversation, not a company to route.
    expect(matchIntent("add more detail")).toBeNull();
    expect(matchIntent("add a note to that")).toBeNull();
    expect(matchIntent("add the same for next week")).toBeNull();
  });

  // The gate on the value used to be `[$\d][\d.,kKmM]*` while parseMoney already
  // understood cr/lakh. Rupee amounts therefore never matched, and the unmatched
  // text stayed glued to whatever preceded it — silently corrupting the account
  // name or the solution, and with it the tower the card was routed to.
  it.each([
    ["add NEOM at 5cr", "NEOM", undefined, 50_000_000],
    ["add Emaar at 3cr", "Emaar", undefined, 30_000_000],
    ["add Emaar for Hire at 3cr", "Emaar", "Hire", 30_000_000],
    ["add Aldar for Hire at 50L", "Aldar", "Hire", 5_000_000],
    ["add Aldar for Hire at 50 lakh", "Aldar", "Hire", 5_000_000],
    ["add ADNOC for Learn at 2.5crore", "ADNOC", "Learn", 25_000_000],
  ])("parses %j in rupee notation", (query, company, solution, value) => {
    expect(matchIntent(query)).toEqual({ kind: "add", company, solution, value });
  });

  // The composer advertises this exact string (src/components/studio/chat.tsx).
  // It parsed as company "Emaar", solution "Hire at 3cr" — which resolves to no
  // practice, so the card fell back to tower T1 and reached the wrong partner.
  // Pinned here so the placeholder and the parser cannot drift apart again.
  it("parses the example the composer tells the operator to type", () => {
    expect(matchIntent("add Emaar for Hire at 3cr")).toEqual({
      kind: "add",
      company: "Emaar",
      solution: "Hire",
      value: 30_000_000,
    });
    expect(matchIntent("add Emaar for Hire at 300K")).toEqual({
      kind: "add",
      company: "Emaar",
      solution: "Hire",
      value: 300_000,
    });
  });

  // Known limit, recorded rather than pretended away: a trailing phrase that is
  // neither `for` nor `at` still lands in the company name. That is what created
  // the account literally called "Genpact in this". The fix for this class is
  // confirming the parse before writing, not a wider regex.
  it("still cannot tell a trailing phrase from part of a company name", () => {
    expect(matchIntent("add Genpact in this")).toMatchObject({ company: "Genpact in this" });
  });
});

describe("matchIntent — sweep", () => {
  it.each(["run the sweep again", "run the sweep", "rerun the sweep"])("%j triggers a sweep", (q) => {
    expect(matchIntent(q)).toMatchObject({ kind: "sweep" });
  });
});

describe("matchIntent — everything else goes to the model", () => {
  it.each([
    "why is Emaar hiring so aggressively?",
    "draft a first note to the CHRO at HDFC Life",
    "what should I say to Meera about Aldar",
    "summarise the Gulf",
    "",
  ])("returns null for %j", (q) => {
    expect(matchIntent(q)).toBeNull();
  });
});

describe("parseMoney — rupee shorthand", () => {
  /**
   * Lakh and crore did not parse at all, so `add NEOM at 5cr` fell through to
   * no value while `at 500k` quietly meant five lakh.
   */
  it("reads crore and lakh", () => {
    expect(parseMoney("3cr")).toBe(30_000_000);
    expect(parseMoney("2.5Cr")).toBe(25_000_000);
    expect(parseMoney("50L")).toBe(5_000_000);
    // Whitespace is stripped before matching, so the spaced form works too.
    expect(parseMoney("75 lakh")).toBe(7_500_000);
    expect(parseMoney("75lakh")).toBe(7_500_000);
  });

  it("strips a rupee sign and Indian grouping", () => {
    expect(parseMoney("₹75,00,000")).toBe(7_500_000);
  });

  /** Deliberately unchanged: a suffix must not silently change meaning. */
  it("keeps k and m meaning thousand and million", () => {
    expect(parseMoney("300k")).toBe(300_000);
    expect(parseMoney("1.5M")).toBe(1_500_000);
  });

  it("still refuses nonsense", () => {
    for (const raw of ["", "abc", "3x", "cr"]) expect(parseMoney(raw)).toBeUndefined();
  });
});
