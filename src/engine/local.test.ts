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
