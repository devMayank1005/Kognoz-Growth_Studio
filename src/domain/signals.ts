/**
 * The 27 ratified signals (PRD §4.2).
 *
 * `windowDays` is the decay window: a signal is fully fresh the day it lands
 * and fully spent once its window has run. Windows differ sharply by signal —
 * a hiring spike goes cold in six weeks, a family succession stays live for a
 * year — so freshness is always relative to the signal's own window, never a
 * global age threshold.
 */

export type Engine = "Hire" | "Learn";
export type Tier = 1 | 2 | 3;

export interface Signal {
  code: string;
  engine: Engine;
  /** Plain description, written to complete "…{company} {description}". */
  description: string;
  tier: Tier;
  windowDays: number;
}

const s = (code: string, engine: Engine, description: string, tier: Tier, windowDays: number): Signal =>
  ({ code, engine, description, tier, windowDays });

export const SIGNALS: readonly Signal[] = [
  s("H1", "Hire", "announced a big hiring number", 1, 42),
  s("H2", "Hire", "posted a surge of job openings", 1, 56),
  s("H3", "Hire", "announced a new GCC / capability center", 1, 90),
  s("H4", "Hire", "is expanding branches / markets", 1, 90),
  s("H5", "Hire", "just got a new TA head or CHRO", 1, 90),
  s("H6", "Hire", "is running a recruitment / assessment RFP", 1, 60),
  s("H7", "Hire", "is under nationalization hiring quotas", 1, 90),
  s("H8", "Hire", "is talking publicly about attrition pain", 2, 90),
  s("H9", "Hire", "won a license / product expansion", 2, 120),
  s("H10", "Hire", "is running campus drives", 3, 30),
  s("H11", "Hire", "is opening a wave of new stores", 2, 120),
  s("L1", "Learn", "just appointed a new CHRO / CLO / talent head", 1, 90),
  s("L2", "Learn", "announced a leadership academy", 1, 56),
  s("L3", "Learn", "announced an M&A integration", 1, 270),
  s("L3b", "Learn", "announced a demerger / spin-off", 1, 270),
  s("L4", "Learn", "is going through a family succession", 1, 365),
  s("L5", "Learn", "announced a major plant / mega-project", 1, 180),
  s("L6", "Learn", "is going live on a new HR system", 1, 180),
  s("L7", "Learn", "launched an enterprise AI program", 2, 180),
  s("L8", "Learn", "brought in a professional CEO", 2, 180),
  s("L9", "Learn", "flagged capability gaps in its annual report", 2, 365),
  s("L10", "Learn", "is prepping an IPO / PE investment", 2, 365),
  s("L11", "Learn", "made nationalization capability commitments", 2, 180),
  s("L12", "Learn", "leadership is talking publicly about talent", 3, 90),
  s("L13", "Learn", "is moving to a skills-based organization", 1, 180),
  s("L14", "Learn", "faces an industry workforce transition", 2, 270),
  s("L15", "Learn", "has a CXO exit with no successor named", 1, 120),
];

const BY_CODE = new Map(SIGNALS.map((sig) => [sig.code, sig]));

export function signalByCode(code: string): Signal | undefined {
  return BY_CODE.get(code);
}

/** Ranking weight by tier (PRD §4.3): 40 / 22 / 8. */
export function tierWeight(tier: Tier): number {
  return tier === 1 ? 40 : tier === 2 ? 22 : 8;
}

/**
 * 1 → just landed, 0 → fully decayed. Linear across the signal's own window.
 * An unknown code is treated as fully decayed: we would rather under-rank a
 * signal we cannot price than invent a window for it.
 */
export function freshness(code: string, ageDays: number): number {
  const signal = BY_CODE.get(code);
  if (!signal) return 0;
  return Math.max(0, 1 - ageDays / signal.windowDays);
}

/**
 * The AMS exception (PRD §4.2, §4.1).
 *
 * L6 (HCM go-live) is the one signal that does not simply decay. A Darwinbox
 * go-live becomes *more* interesting once it is 6-18 months old, because that
 * is when application-managed-services work becomes the natural next
 * conversation. Inside this window an L6 resurfaces as a T2 annuity play.
 */
export const AMS_WINDOW_START_DAYS = 180;
export const AMS_WINDOW_END_DAYS = 540;

export function isAmsWindow(code: string, ageDays: number): boolean {
  return code === "L6" && ageDays >= AMS_WINDOW_START_DAYS && ageDays <= AMS_WINDOW_END_DAYS;
}
