import { describe, expect, it } from "vitest";
import { buildPacket } from "./packet";

const card = {
  account: "Emaar", country: "UAE", tower: "T3" as const, partner: "Rahul",
  practice: "Hire (JobFit AI)", value: 300_000, tier: "core", whale: false,
  evidence: "Announced 2,000 hires", url: "https://example.com/news", contact: "CHRO",
};

describe("buildPacket — PRD §5", () => {
  const text = buildPacket(card, { today: "2026-09-02" });

  it("leads with the account and its market", () => {
    expect(text.split("\n")[0]).toBe("OPPORTUNITY — Emaar (UAE)");
  });

  it("routes to the tower and the named partner", () => {
    expect(text).toMatch(/Tower: Konverz Hire → Rahul/);
  });

  it("carries the working value and tier", () => {
    expect(text).toMatch(/Value \(working\): \$300K · core/);
  });

  it("carries the trigger AND its source — a claim without a source is not evidence", () => {
    expect(text).toContain("Announced 2,000 hires");
    expect(text).toContain("https://example.com/news");
  });

  it("always names a door, even when unknown", () => {
    expect(buildPacket({ ...card, contact: "" }, { today: "2026-09-02" })).toMatch(/Door: to be found/);
  });

  it("marks a whale", () => {
    expect(buildPacket({ ...card, whale: true, tier: "whale" }, { today: "2026-09-02" })).toContain("WHALE");
  });

  it("includes the draft when one is attached, labelled for editing", () => {
    const withDraft = buildPacket(card, { today: "2026-09-02", draft: { subject: "S", body: "B" } });
    expect(withDraft).toMatch(/DRAFT/);
    expect(withDraft).toContain("Subject: S");
  });

  it("closes with a dated verify-before-acting line", () => {
    expect(text.trim().endsWith("— Growth Engine · 2026-09-02 · verify before acting")).toBe(true);
  });

  it("carries no email address or phone number (§8)", () => {
    expect(text).not.toMatch(/@|\+\d{6,}/);
  });
});
