/**
 * Revenue math (PRD §7).
 *
 * The 18-month curve is three linear segments joined at the committed anchor
 * points: ~₹15Cr by M6, ₹65Cr by M12, ₹200Cr by M18.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THESE NUMBERS ARE RUPEES. DO NOT CONVERT THEM AGAIN.
 *
 * The programme was re-denominated from USD to INR once, at a frozen rate of
 * ₹100 (see `REDENOMINATION` below and migration 0011). Every figure here is a
 * literal, written out rather than computed, because a constant derived from a
 * rate *looks* like a live conversion — and the next reader who wires it to
 * `settings.fx_usd_inr` "for consistency" turns a fixed commitment into one
 * that moves with the market, and re-tiers live cards while they are at it.
 *
 * The rate is frozen precisely so these never move.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { Currency } from "./money";

/**
 * The one-time re-denomination, recorded so nobody has to guess.
 *
 * Named and exported rather than left in a comment: anyone about to "fix" one
 * of the numbers below will grep for it and land here first.
 */
export const REDENOMINATION = {
  from: "USD",
  to: "INR",
  /** ₹100 to the dollar. A planning rate, deliberately round — not a market print. */
  rate: 100,
  at: "2026-09-07",
  migration: "0011",
} as const;

/**
 * The currency the constants in this file and in `routing.ts` are denominated
 * in. Compared against `settings.base_currency` before any write that prices a
 * card, so stored values and thresholds can never silently disagree.
 */
export const CONSTANTS_CURRENCY: Currency = "INR";

/** ₹200Cr. */
export const PROGRAM_TARGET = 2_000_000_000;

/**
 * The contractual commitment (PRD §0), kept beside the rupee figure it encodes.
 *
 * Documentation in code, never converted at runtime: rendering the target
 * through the live rate would make the headline read $21.2M one week and
 * $19.4M the next, contradicting "$20M" far more visibly than rupees do.
 */
export const PROGRAM_TARGET_USD = 20_000_000;

/** Tower split (PRD §0, §7): T2 ₹60Cr · T3 ₹50Cr · T4 ₹50Cr · T1 ₹40Cr. */
export const TOWER_TARGETS = {
  T1: 400_000_000,
  T2: 600_000_000,
  T3: 500_000_000,
  T4: 500_000_000,
} as const;

export type TowerKey = keyof typeof TOWER_TARGETS;

const DAYS_PER_MONTH = 30.44;
const MS_PER_DAY = 86_400_000;

/** Cumulative closed-revenue target by programme month. Clamps at ₹200Cr. */
export function curveTarget(month: number): number {
  // ₹15Cr by M6, ₹65Cr by M12, ₹200Cr by M18. Rupees — see the file header.
  if (month <= 6) return 150_000_000 * (month / 6);
  if (month <= 12) return 150_000_000 + 500_000_000 * ((month - 6) / 6);
  return Math.min(PROGRAM_TARGET, 650_000_000 + 1_350_000_000 * ((month - 12) / 6));
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
