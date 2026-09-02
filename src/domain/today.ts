/**
 * The Today queue (PRD §9.9) — "the Monday review's first screen".
 *
 * Four lists, each derived here as a pure function over rows so the rules are
 * unit-tested rather than tangled into JSX. Beat-2 ripening lives here too but
 * cannot produce results until drafts exist to record a congratulation.
 */

const MS_PER_DAY = 86_400_000;
const CLOSED = new Set(["Won", "Lost"]);

/** PRD §5: a packet sitting with a partner goes red after three days. */
export const PARTNER_SILENCE_DAYS = 3;

/** PRD §4.6: congratulate now, substance at +21 days. */
export const BEAT_TWO_DAYS = 21;

export interface TodayCard {
  id: string;
  account: string;
  stage: string;
  /** ISO date, or empty. */
  dueOn: string;
  /** ISO date the packet went to the partner, or empty. */
  dispatchedAt: string;
  next: string;
  partner: string;
}

const isLive = (c: { stage: string }) => !CLOSED.has(c.stage);
const dayOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const daysBetween = (fromISO: string, now: Date) =>
  Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - dayOf(fromISO)) / MS_PER_DAY);

/** Live cards due today or already overdue, most overdue first. */
export function dueNow<T extends TodayCard>(cards: readonly T[], now: Date = new Date()): T[] {
  const today = now.toISOString().slice(0, 10);
  return cards
    .filter((c) => isLive(c) && c.dueOn && c.dueOn <= today)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/**
 * Packets a partner has been sitting on for more than three days. The count is
 * returned with the row because the UI shows "with partner Nd" and turns red.
 */
export function withPartnerTooLong<T extends TodayCard>(
  cards: readonly T[],
  now: Date = new Date(),
): Array<T & { daysWithPartner: number }> {
  return cards
    .filter((c) => isLive(c) && c.dispatchedAt)
    .map((c) => ({ ...c, daysWithPartner: daysBetween(c.dispatchedAt, now) }))
    .filter((c) => c.daysWithPartner > PARTNER_SILENCE_DAYS)
    .sort((a, b) => b.daysWithPartner - a.daysWithPartner);
}

/**
 * AMS windows opening (PRD §4.2). The hard part — which L6 go-lives are inside
 * the 180-540 day window — is already done and tested in `scoring.ts`; this
 * only filters to accounts with no live thread.
 */
export function amsWindows<T extends { ams: boolean; inPipeline: boolean }>(targets: readonly T[]): T[] {
  return targets.filter((t) => t.ams && !t.inPipeline);
}

export interface CongratsRecord {
  opportunityId: string;
  account: string;
  /** ISO date the congratulation was sent. */
  sentOn: string;
}

/**
 * Beat 2 of the two-beat CHRO play: a congratulation was sent, and 21 days
 * have passed, so the substantive note is due.
 *
 * NOTE: this returns nothing until drafts ship, because nothing yet records a
 * congratulation. The rule is built and tested now so the list is correct the
 * day that changes — an empty list is honest, a missing one is not.
 */
export function beatTwoRipe<T extends CongratsRecord>(
  congrats: readonly T[],
  now: Date = new Date(),
): T[] {
  return congrats
    .filter((c) => c.sentOn && daysBetween(c.sentOn, now) >= BEAT_TWO_DAYS)
    .sort((a, b) => a.sentOn.localeCompare(b.sentOn));
}
