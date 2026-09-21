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

/**
 * A const array, not a bare type union, so a zod schema can be built from it.
 *
 * `generateDraft` and `markDraftSent` take the kind straight from the browser
 * and it reaches `afterSend` and the mail prompt; a type union cannot check that
 * at runtime. One list, so the guard cannot drift from the thing it guards.
 */
export const DRAFT_KINDS = [
  "first-touch", "congrats", "follow-up", "value-add",
  "meeting-confirm", "proposal-nudge", "linkedin-pov",
] as const;

export type DraftKind = (typeof DRAFT_KINDS)[number];

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

/**
 * Signals that mean "someone just took the job" — the two-beat play (§4.6).
 * A congratulation, then the real ask 21 days later.
 */
const APPOINTMENT_SIGNALS = new Set(["L1", "H5"]);

/** How fresh an appointment has to be for a congratulation to land, in days. */
export const CONGRATS_WINDOW_DAYS = 10;

/**
 * The draft kind a card should default to.
 *
 * `stageKind` alone can never return "congrats", so the two-beat play was dead:
 * every fresh CHRO appointment got a first-touch pitch that spent one of the
 * three touches, which is exactly what `afterSend` is written to avoid. A
 * congratulation costs no touch and schedules beat 2 at +21 days.
 */
export function defaultDraftKind(card: {
  stage: string;
  touches: number;
  signal?: string;
  ageDays?: number;
}): DraftKind {
  const fresh = card.ageDays === undefined || card.ageDays <= CONGRATS_WINDOW_DAYS;
  if (card.touches === 0 && card.signal && APPOINTMENT_SIGNALS.has(card.signal) && fresh) {
    return "congrats";
  }
  return stageKind(card.stage);
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
