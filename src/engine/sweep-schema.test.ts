import { describe, expect, it } from "vitest";
import { cleanSweepItems, sweepItemSchema } from "./sweep-schema";

const NOW = new Date("2026-09-02T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(NOW.getTime() - n * 86_400_000));
const inDays = (n: number) => iso(new Date(NOW.getTime() + n * 86_400_000));

const item = (over = {}) => ({
  account: "Emaar",
  engine: "Learn" as const,
  country: "UAE",
  segment: "Developer",
  signal: "L1",
  headline: "New CHRO appointed",
  evidence: "Appointed a new CHRO effective April 2026",
  url: "https://example.com/news",
  date: daysAgo(3),
  confidence: "high" as const,
  ...over,
});

describe("sweepItemSchema", () => {
  it("accepts a well-formed finding", () => {
    expect(sweepItemSchema.safeParse(item()).success).toBe(true);
  });

  it("rejects a finding with no account name", () => {
    expect(sweepItemSchema.safeParse(item({ account: "" })).success).toBe(false);
  });
});

describe("cleanSweepItems — what the model returns is not trusted", () => {
  it("keeps a valid finding", () => {
    expect(cleanSweepItems([item()], NOW).items).toHaveLength(1);
  });

  it("DROPS a signal code that is not in the ratified taxonomy", () => {
    // The model can invent "H99". Storing it would corrupt every downstream
    // score, because tier and decay window come from the taxonomy.
    const out = cleanSweepItems([item({ signal: "H99" })], NOW);
    expect(out.items).toHaveLength(0);
    expect(out.dropped[0]).toMatch(/H99/);
  });

  it("DROPS a finding dated in the future", () => {
    const out = cleanSweepItems([item({ date: inDays(5) })], NOW);
    expect(out.items).toHaveLength(0);
    expect(out.dropped[0]).toMatch(/future/i);
  });

  it("drops a finding whose date cannot be parsed", () => {
    expect(cleanSweepItems([item({ date: "last Tuesday" })], NOW).items).toHaveLength(0);
  });

  it("STRIPS an email address that leaked into the evidence (§8)", () => {
    const out = cleanSweepItems(
      [item({ evidence: "Reachable at chro@emaar.com per the release" })],
      NOW,
    );
    expect(out.items).toHaveLength(1);
    expect(out.items[0].evidence).not.toMatch(/@/);
  });

  it("STRIPS a phone number that leaked into the evidence (§8)", () => {
    const out = cleanSweepItems([item({ evidence: "Call +971 4 555 1234 for detail" })], NOW);
    expect(out.items[0].evidence).not.toMatch(/\+\d/);
  });

  it("normalises the NEW: prefix but keeps the discovered flag", () => {
    const out = cleanSweepItems([item({ account: "NEW: Lulu Group" })], NOW);
    expect(out.items[0].account).toBe("Lulu Group");
    expect(out.items[0].isNew).toBe(true);
  });

  it("marks a known company as not new", () => {
    expect(cleanSweepItems([item({ account: "Emaar" })], NOW).items[0].isNew).toBe(false);
  });

  it("takes tier from the taxonomy, never from the model", () => {
    // The schema has no tier field at all; even if a model volunteered one it
    // is ignored, and H1's ratified tier 1 stands.
    const out = cleanSweepItems([item({ signal: "H1", tier: 3 } as never)], NOW);
    expect(out.items[0].tier).toBe(1);
  });

  it("drops a finding with no usable source url", () => {
    const out = cleanSweepItems([item({ url: "" })], NOW);
    expect(out.items).toHaveLength(0);
    expect(out.dropped[0]).toMatch(/source/i);
  });

  it("reports every drop so failures are visible, not silent", () => {
    const out = cleanSweepItems([item(), item({ signal: "ZZ9" }), item({ date: inDays(1) })], NOW);
    expect(out.items).toHaveLength(1);
    expect(out.dropped).toHaveLength(2);
  });
});
