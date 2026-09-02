/**
 * Revenue math (PRD §7).
 *
 * The $20M/18-month curve is three linear segments joined at the committed
 * anchor points: ~$1.5M by M6, $6.5M by M12, $20M by M18.
 */

export const PROGRAM_TARGET = 20_000_000;

/** Tower split (PRD §0, §7): T2 $6M · T3 $5M · T4 $5M · T1 $4M. */
export const TOWER_TARGETS = {
  T1: 4_000_000,
  T2: 6_000_000,
  T3: 5_000_000,
  T4: 5_000_000,
} as const;

export type TowerKey = keyof typeof TOWER_TARGETS;

const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;

/** Cumulative closed-revenue target by programme month. Clamps at $20M. */
export function curveTarget(month: number): number {
  if (month <= 6) return 1_500_000 * (month / 6);
  if (month <= 12) return 1_500_000 + 5_000_000 * ((month - 6) / 6);
  return Math.min(PROGRAM_TARGET, 6_500_000 + 13_500_000 * ((month - 12) / 6));
}

/**
 * Which programme month we are in, 1-indexed.
 *
 * `now` is injected rather than read from the clock so this stays pure and
 * the programme clock can be exercised in tests.
 */
export function monthOf(programStartISO: string, now: Date = new Date()): number {
  const elapsedMs = now.getTime() - new Date(programStartISO).getTime();
  return Math.max(1, Math.floor(elapsedMs / (DAYS_PER_MONTH * MS_PER_DAY)) + 1);
}
