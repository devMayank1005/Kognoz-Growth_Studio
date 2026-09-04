import { describe, expect, it } from "vitest";
import { PARK_DAYS, TOUCH_CAP, afterSend, defaultDraftKind, stageKind } from "./touches";
import { BEAT_TWO_DAYS } from "./today";

const NOW = new Date("2026-09-02T00:00:00Z");
const plus = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString().slice(0, 10);

const card = (over = {}) => ({ stage: "Prospect" as const, touches: 0, ...over });

describe("afterSend — touch counting", () => {
  it("moves a Prospect to Reached out and counts the touch", () => {
    const r = afterSend(card(), "first-touch", NOW);
    expect(r.stage).toBe("Reached out");
    expect(r.touches).toBe(1);
  });

  it("moves a Tagged card to Reached out too", () => {
    expect(afterSend(card({ stage: "Plan reach-out" }), "first-touch", NOW).stage).toBe("Reached out");
  });

  it("does not drag a further-along card backwards", () => {
    // Sending a value-add to someone already in conversation must not demote
    // them to Reached out.
    const r = afterSend(card({ stage: "In conversation", touches: 2 }), "value-add", NOW);
    expect(r.stage).toBe("In conversation");
    expect(r.touches).toBe(3);
  });
});

describe("afterSend — the 3-touch cap (PRD §4.6)", () => {
  it("does not flag on the second touch", () => {
    expect(afterSend(card({ touches: 1 }), "follow-up", NOW).rotateOrPark).toBe(false);
  });

  it("flags rotate-or-park on the third", () => {
    const r = afterSend(card({ touches: 2 }), "follow-up", NOW);
    expect(r.touches).toBe(3);
    expect(r.rotateOrPark).toBe(true);
  });

  it("keeps flagging beyond the cap rather than silently forgetting", () => {
    expect(afterSend(card({ touches: 5 }), "follow-up", NOW).rotateOrPark).toBe(true);
  });

  it("uses the cap the doctrine states", () => {
    expect(TOUCH_CAP).toBe(3);
    expect(PARK_DAYS).toBe(90);
  });
});

describe("afterSend — the two-beat CHRO play (PRD §4.6)", () => {
  it("schedules beat 2 exactly 21 days after a congratulation", () => {
    const r = afterSend(card(), "congrats", NOW);
    expect(r.dueOn).toBe(plus(BEAT_TWO_DAYS));
    expect(r.next).toMatch(/beat 2|substance/i);
  });

  it("does not count a congratulation against the 3-touch cap", () => {
    // Beat 1 is a courtesy with zero ask; spending a touch on it would burn a
    // third of the door's budget on saying hello.
    const r = afterSend(card({ touches: 0 }), "congrats", NOW);
    expect(r.touches).toBe(0);
    expect(r.rotateOrPark).toBe(false);
  });

  it("gives an ordinary send a nearer due date than beat 2", () => {
    const r = afterSend(card(), "first-touch", NOW);
    expect(r.dueOn < plus(BEAT_TWO_DAYS)).toBe(true);
  });
});

describe("defaultDraftKind — the two-beat play must be reachable", () => {
  it("congratulates a fresh, untouched CHRO appointment", () => {
    expect(defaultDraftKind({ stage: "Prospect", touches: 0, signal: "L1", ageDays: 3 })).toBe("congrats");
    expect(defaultDraftKind({ stage: "Plan reach-out", touches: 0, signal: "H5", ageDays: 0 })).toBe("congrats");
  });

  it("does not congratulate once a touch has been spent", () => {
    expect(defaultDraftKind({ stage: "Prospect", touches: 1, signal: "L1", ageDays: 3 })).toBe("first-touch");
  });

  it("does not congratulate a stale appointment", () => {
    expect(defaultDraftKind({ stage: "Prospect", touches: 0, signal: "L1", ageDays: 40 })).toBe("first-touch");
  });

  it("does not congratulate a signal that is not an appointment", () => {
    expect(defaultDraftKind({ stage: "Prospect", touches: 0, signal: "L6", ageDays: 1 })).toBe("first-touch");
  });

  it("falls back to the stage rule when no signal is known", () => {
    expect(defaultDraftKind({ stage: "Meeting set", touches: 2 })).toBe(stageKind("Meeting set"));
  });

  /** The point of the play: a congratulation must not spend a touch. */
  it("costs no touch and sets beat two 21 days out", () => {
    const before = { stage: "Prospect", touches: 0 };
    const after = afterSend(before, defaultDraftKind({ ...before, signal: "L1", ageDays: 2 }));
    expect(after.touches).toBe(0);
  });
});
