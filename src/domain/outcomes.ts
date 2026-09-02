/**
 * The outcome grid (PRD §5) — what happens to a card when the world responds.
 *
 * A transition table rather than conditionals scattered through a component,
 * because "what does Quiet do to the due date" should have exactly one answer
 * and it should be readable at a glance.
 */

import type { Stage } from "./routing";
import { PARK_DAYS } from "./touches";

export const OUTCOMES = ["replied", "meeting", "quiet", "proposal", "park", "won", "dead"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface OutcomeEffect {
  /** Undefined means the stage does not change. */
  stage?: Stage;
  next?: string;
  /** Undefined means no due date — a closed card is not chased. */
  dueOn?: string;
  /** Clear the partner clock: the packet did its job. */
  clearDispatched?: boolean;
}

interface Rule {
  stage?: Stage;
  next?: string;
  dueInDays?: number;
  clearDispatched?: boolean;
}

const GRID: Record<Outcome, Rule> = {
  replied:  { stage: "In conversation", next: "Send something useful", dueInDays: 4, clearDispatched: true },
  meeting:  { stage: "Meeting set", next: "Confirm and prep", dueInDays: 1, clearDispatched: true },
  // Quiet and park are timing, not progress — the stage is untouched.
  quiet:    { next: "Gentle nudge, or rotate the door", dueInDays: 0 },
  proposal: { stage: "Proposal", next: "De-risking nudge", dueInDays: 4, clearDispatched: true },
  park:     { next: "Parked — revisit", dueInDays: PARK_DAYS },
  won:      { stage: "Won" },
  dead:     { stage: "Lost" },
};

export function applyOutcome(outcome: Outcome, now: Date = new Date()): OutcomeEffect {
  const rule = GRID[outcome];
  return {
    stage: rule.stage,
    next: rule.next,
    dueOn:
      rule.dueInDays === undefined
        ? undefined
        : new Date(now.getTime() + rule.dueInDays * 86_400_000).toISOString().slice(0, 10),
    clearDispatched: rule.clearDispatched,
  };
}

export const OUTCOME_LABELS: Record<Outcome, string> = {
  replied: "Replied", meeting: "Meeting", quiet: "Quiet",
  proposal: "Proposal", park: "Park 90d", won: "Won", dead: "Dead",
};
