/**
 * Turning an engine row into a pipeline card (PRD §5 — "direct add only").
 *
 * Every add in the product goes through here: the chat action table, the
 * quick-add box, and the `add {company} …` intent. Routing, valuation, and
 * tiering therefore have exactly one definition.
 */

import { practiceByName, towerOfPractice } from "./practices";
import type { TowerKey } from "./revenue";

export const STAGES = [
  "Prospect",
  "Plan reach-out",
  "Reached out",
  "In conversation",
  "Meeting set",
  "Proposal",
  "Won",
  "Lost",
] as const;
export type Stage = (typeof STAGES)[number];

/**
 * Tier thresholds (PRD §5): wedge < ₹2.5Cr ≤ core < ₹5Cr ≤ whale.
 *
 * **Rupees. Do not convert them again** — see the header of `revenue.ts` and
 * `REDENOMINATION`. A floor that moves re-tiers live cards, and `tier` is a
 * stored column, so the stored value and the derived one would then disagree.
 */
export const TIER_VALUE = { wedge: 7_500_000, core: 30_000_000, whale: 50_000_000 } as const;
export const CORE_FLOOR = 25_000_000;
export const WHALE_FLOOR = 50_000_000;

/**
 * The largest value that can be typed on a card: ₹1000Cr.
 *
 * Was a bare `100_000_000` inside `setCardValue` with a "$100M" message beside
 * it. Left alone it would have become a ₹10Cr cap — roughly $1.1M — and started
 * refusing perfectly ordinary whale deals.
 */
export const VALUE_CAP = 10_000_000_000;
export type Tier = "wedge" | "core" | "whale";

/** A row as the engine emits it. Deliberately carries no personal contact fields. */
export interface EngineRow {
  company: string;
  solution?: string;
  contact_name?: string;
  contact_title?: string;
  country?: string;
  industry?: string;
  trigger?: string;
  signal?: string;
  value?: number;
  url?: string;
}

export interface Card {
  id: string;
  account: string;
  practice: string;
  signal: string;
  evidence: string;
  url: string;
  /** "Name (Title)", or the target role, or empty. Never an email or phone. */
  contact: string;
  country: string;
  industry: string;
  stage: Stage;
  next: string;
  due: string;
  tower: TowerKey;
  partner: string;
  tier: Tier;
  value: number;
  whale: boolean;
  touches: number;
  dispatchedAt: string;
  created: string;
  updatedAt: string;
  zohoSyncedAt: string;
}

export interface MakeCardOptions {
  partnerOf: (tower: TowerKey) => string;
  stage?: Stage;
  /** Injected so the card is deterministic in tests. */
  today?: Date;
  id?: string;
}

export function tierFor(value: number): Tier {
  if (value >= WHALE_FLOOR) return "whale";
  if (value >= CORE_FLOOR) return "core";
  return "wedge";
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => iso(new Date(d.getTime() + n * 86_400_000));

/** Radar finds arrive prefixed; the prefix is display noise, not part of the name. */
export function cleanName(name: string | null | undefined): string {
  return String(name ?? "").replace(/^NEW:\s*/, "").trim();
}

export function makeCard(row: EngineRow, options: MakeCardOptions): Card {
  const { partnerOf, stage = "Prospect", today = new Date() } = options;

  // "Hire (JobFit AI)" and "Hire" both mean the Hire practice.
  const practice = String(row.solution ?? "TBD").split(" (")[0];
  const tower = towerOfPractice(practiceByName(practice)?.id ?? "");

  const value = Number(row.value) || TIER_VALUE.core;
  const tier = tierFor(value);

  // Operator intent (an explicit `add …`) skips Prospect, so the card opens
  // already tagged and carries a due date.
  const operatorIntent = stage !== "Prospect";

  return {
    id: options.id ?? crypto.randomUUID(),
    account: cleanName(row.company),
    practice,
    signal: row.signal ?? "",
    evidence: row.trigger ?? "",
    url: row.url ?? "",
    contact: row.contact_name
      ? `${row.contact_name} (${row.contact_title ?? ""})`
      : (row.contact_title ?? ""),
    country: row.country ?? "",
    industry: row.industry ?? "",
    stage,
    next: operatorIntent ? "Send the first note" : "Draft the first note",
    due: operatorIntent ? addDays(today, 2) : "",
    tower,
    partner: partnerOf(tower),
    tier,
    value,
    whale: tier === "whale",
    touches: 0,
    dispatchedAt: "",
    created: iso(today),
    updatedAt: iso(today),
    zohoSyncedAt: "",
  };
}
