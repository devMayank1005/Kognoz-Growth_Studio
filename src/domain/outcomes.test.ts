import { describe, expect, it } from "vitest";
import { OUTCOMES, applyOutcome } from "./outcomes";

const NOW = new Date("2026-09-02T00:00:00Z");
const plus = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

describe("applyOutcome — the grid in PRD §5", () => {
  it.each([
    ["replied", "In conversation"],
    ["meeting", "Meeting set"],
    ["proposal", "Proposal"],
    ["won", "Won"],
    ["dead", "Lost"],
  ] as const)("%s moves the card to %s", (outcome, stage) => {
    expect(applyOutcome(outcome, NOW).stage).toBe(stage);
  });

  it("leaves the stage alone for quiet and park — they are timing, not progress", () => {
    expect(applyOutcome("quiet", NOW).stage).toBeUndefined();
    expect(applyOutcome("park", NOW).stage).toBeUndefined();
  });

  it("parks for 90 days", () => {
    expect(applyOutcome("park", NOW).dueOn).toBe(plus(90));
  });

  it("clears the partner clock when the thread comes back to life", () => {
    // A reply means the packet did its job; the card should stop appearing in
    // "with partners over 3 days".
    expect(applyOutcome("replied", NOW).clearDispatched).toBe(true);
    expect(applyOutcome("meeting", NOW).clearDispatched).toBe(true);
  });

  it("gives every outcome a next step, so no card is left without one", () => {
    for (const o of OUTCOMES) {
      const r = applyOutcome(o, NOW);
      if (o !== "won" && o !== "dead") expect(r.next).toBeTruthy();
    }
  });

  it("sets no due date on a closed card", () => {
    expect(applyOutcome("won", NOW).dueOn).toBeUndefined();
    expect(applyOutcome("dead", NOW).dueOn).toBeUndefined();
  });
});
