/**
 * Touch counting and the reach-out doctrine (PRD §4.6, §5).
 *
 * These rules decide when a door is spent, which is the difference between
 * persistence and pestering. They are pure so they can be exercised directly.
 */

import { BEAT_TWO_DAYS } from "./today";
import type { Stage } from "./routing";

/** Three touches per door, then rotate or park (§4.6). */
export const TOUCH_CAP = 3;
/** Parking a door puts it down for a quarter. */
export const PARK_DAYS = 90;
/** An ordinary send expects a reply inside the working week. */
const FOLLOW_UP_DAYS = 5;

export type DraftKind =
  | "first-touch" | "congrats" | "follow-up" | "value-add"
  | "meeting-confirm" | "proposal-nudge" | "linkedin-pov";

/** Stages that a send should advance to "Reached out". */
const EARLY: readonly string[] = ["Prospect", "Plan reach-out"];

export interface SendResult {
  stage: Stage | undefined;
  touches: number;
  next: string;
  dueOn: string;
  /** True once the door has had its three touches — rotate or park (§4.6). */
  rotateOrPark: boolean;
}

const addDays = (now: Date, n: number) =>
  new Date(now.getTime() + n * 86_400_000).toISOString().slice(0, 10);

export function afterSend(
  card: { stage: string; touches: number },
  kind: DraftKind,
  now: Date = new Date(),
): SendResult {
  // Beat 1 is a congratulation with zero ask (§4.6). It does not spend a touch
  // — burning a third of a door's budget on saying hello would be absurd — and
  // it schedules the substantive note 21 days out, which is what Today's
  // beat-2 list looks for.
  if (kind === "congrats") {
    return {
      stage: EARLY.includes(card.stage) ? "Reached out" : (card.stage as Stage),
      touches: card.touches,
      next: "Beat 2 — the substance note",
      dueOn: addDays(now, BEAT_TWO_DAYS),
      rotateOrPark: false,
    };
  }

  const touches = card.touches + 1;

  return {
    // Never drag a card backwards: a value-add to someone already talking must
    // not demote them to Reached out.
    stage: EARLY.includes(card.stage) ? "Reached out" : (card.stage as Stage),
    touches,
    next: touches >= TOUCH_CAP ? "Rotate the door or park it" : "Wait for a reply, then follow up",
    dueOn: addDays(now, touches >= TOUCH_CAP ? PARK_DAYS : FOLLOW_UP_DAYS),
    rotateOrPark: touches >= TOUCH_CAP,
  };
}

/** The default draft kind for a card's stage, as the prototype does. */
export function stageKind(stage: string): DraftKind {
  return (
    {
      "Prospect": "first-touch",
      "Plan reach-out": "first-touch",
      "Reached out": "follow-up",
      "In conversation": "value-add",
      "Meeting set": "meeting-confirm",
      "Proposal": "proposal-nudge",
    } as Record<string, DraftKind>
  )[stage] ?? "value-add";
}
