/**
 * Target ranking (PRD §4.3).
 *
 *   score = tierWeight(40/22/8)
 *         + 35 × freshness(1 − age/window)
 *         + relationship(new 12 · client 8 · watch 5)
 *
 * AMS rows are pinned at a fixed 30 — they are an annuity motion on a known
 * install base, not a fresh trigger, so decay and relationship do not apply.
 */

import { industryOf, type Industry } from "./industry";
import { practicesForSignal, towerOfPractice } from "./practices";
import type { TowerKey } from "./revenue";
import { AMS_WINDOW_END_DAYS, AMS_WINDOW_START_DAYS, freshness, isAmsWindow, signalByCode, tierWeight, type Engine, type Tier } from "./signals";

export const FRESHNESS_WEIGHT = 35;
export const AMS_SCORE = 30;
export const RADAR_GRACE_DAYS = 14;

/** Markets benched by the 10-step dialogue (PRD §0). */
export const BENCHED_MARKETS = ["Thailand", "Qatar"];

/** The tower that owns the AMS motion (PRD §0: "AMS motion for T2"). */
export const AMS_TOWER: TowerKey = "T2";

export type Relationship = "new" | "client" | "watch";
export const RELATIONSHIP_WEIGHT: Record<Relationship, number> = { new: 12, client: 8, watch: 5 };

export interface SweepItem {
  account: string;
  signal: string;
  date: string;
  evidence?: string;
  headline?: string;
  country?: string;
  segment?: string;
  engine?: Engine;
  url?: string;
}

export interface UniverseAccount {
  name: string;
  country?: string;
  segment?: string;
  engine?: Engine;
  status: "client" | "prospect" | "discovered";
  anchor?: string;
  /** When the radar first saw this company. Only set for discovered accounts. */
  firstSeen?: string;
  evidence?: string;
}

export interface PipelineCard {
  account: string;
  stage: string;
}

export interface Target {
  name: string;
  country: string;
  industry: Industry;
  tower: TowerKey;
  signal: string;
  tier: Tier;
  ageDays: number;
  score: number;
  relationship: Relationship;
  inPipeline: boolean;
  ams: boolean;
  radarOnly: boolean;
  evidence: string;
  url: string;
  date: string;
}

const MS_PER_DAY = 86_400_000;
const CLOSED_STAGES = new Set(["Won", "Lost"]);

function ageInDays(dateISO: string | undefined, now: Date): number {
  if (!dateISO) return Number.MAX_SAFE_INTEGER;
  return (now.getTime() - new Date(dateISO).getTime()) / MS_PER_DAY;
}

export function scoreTarget(input: { signalCode: string; ageDays: number; relationship: Relationship }): number {
  const tier = signalByCode(input.signalCode)?.tier ?? 3;
  return (
    tierWeight(tier) +
    FRESHNESS_WEIGHT * freshness(input.signalCode, input.ageDays) +
    RELATIONSHIP_WEIGHT[input.relationship]
  );
}

/**
 * The tower a signal belongs to: the first practice that claims it wins.
 * A signal no practice claims falls back on the engine — Hire work is T3,
 * everything else starts at T1.
 */
export function towerOfSignal(code: string, engine?: Engine): TowerKey {
  const practice = practicesForSignal(code)[0];
  if (practice) return towerOfPractice(practice.id);
  return engine === "Hire" ? "T3" : "T1";
}

export interface RankInput {
  items: SweepItem[];
  universe: UniverseAccount[];
  /** Live pipeline cards, used to flag accounts already in conversation. */
  pipeline?: PipelineCard[];
  /** Past signals, scanned for L6 go-lives ripening into an AMS window. */
  history?: SweepItem[];
  /** Do-not-contact company names (PRD §8). */
  dnc?: string[];
  now?: Date;
}

export function rankTargets(input: RankInput): Target[] {
  const { items, universe, pipeline = [], history = [], dnc = [], now = new Date() } = input;

  const accountByName = new Map(universe.map((a) => [a.name, a]));
  const liveCardByAccount = new Map(
    pipeline.filter((c) => !CLOSED_STAGES.has(c.stage)).map((c) => [c.account, c]),
  );
  const blocked = new Set(dnc);
  const best = new Map<string, Target>();

  const consider = (
    name: string,
    item: SweepItem,
    flags: { ams?: boolean; radarOnly?: boolean } = {},
  ): void => {
    if (!name || blocked.has(name)) return;

    const account = accountByName.get(name);
    const country = item.country || account?.country || "—";
    if (BENCHED_MARKETS.includes(country)) return;

    const relationship: Relationship = !account || account.status === "discovered"
      ? "new"
      : account.status === "client"
        ? "client"
        : "watch";

    const ageDays = ageInDays(item.date, now);
    const tier = signalByCode(item.signal)?.tier ?? 3;

    // PRD §4.2: L6 "does not decay for T2 — resurfaces at 180-540 days as an
    // AMS play". An aged go-live is therefore an AMS opportunity wherever it
    // arrives from, not a stale tier-1 signal. Detecting it here rather than
    // only in the history pass means a caller that supplies one signal list
    // for both arguments still gets the right answer.
    const isAms = flags.ams || isAmsWindow(item.signal, ageDays);
    const score = isAms ? AMS_SCORE : scoreTarget({ signalCode: item.signal, ageDays, relationship });

    const target: Target = {
      name,
      country,
      industry: industryOf(item.segment || account?.segment),
      // The AMS motion is a T2 play regardless of which practice nominally
      // owns L6 — the Darwinbox tower runs it.
      tower: isAms ? AMS_TOWER : towerOfSignal(item.signal, item.engine || account?.engine),
      signal: item.signal,
      tier,
      ageDays,
      score,
      relationship,
      inPipeline: liveCardByAccount.has(name),
      ams: isAms,
      radarOnly: flags.radarOnly ?? false,
      evidence: item.evidence || item.headline || "",
      url: item.url ?? "",
      date: item.date,
    };

    const incumbent = best.get(name);
    if (!incumbent || incumbent.score < score) best.set(name, target);
  };

  // 1. Live signals from the sweeps.
  for (const item of items) consider(cleanAccountName(item.account), item);

  // 2. L6 go-lives ripening into an AMS window, where no thread is already open.
  for (const past of history) {
    if (past.signal !== "L6" || !past.date) continue;
    const age = ageInDays(past.date, now);
    if (age < AMS_WINDOW_START_DAYS || age > AMS_WINDOW_END_DAYS) continue;
    if (liveCardByAccount.has(past.account) || best.has(past.account)) continue;
    consider(
      past.account,
      {
        ...past,
        headline: "AMS window",
        evidence: past.evidence || `HCM live ~${Math.round(age / 30)} months — AMS window`,
      },
      { ams: true },
    );
  }

  // 3. Recent radar finds carried for a fortnight even with no live signal.
  for (const account of universe) {
    if (account.status !== "discovered" || !account.firstSeen) continue;
    if (ageInDays(account.firstSeen, now) > RADAR_GRACE_DAYS) continue;
    if (best.has(account.name) || liveCardByAccount.has(account.name)) continue;
    consider(
      account.name,
      {
        account: account.name,
        signal: "",
        date: account.firstSeen,
        headline: "Radar find",
        evidence: account.evidence || "Radar find",
        country: account.country,
        segment: account.segment,
        engine: account.engine,
      },
      { radarOnly: true },
    );
  }

  return [...best.values()].sort((a, b) => b.score - a.score);
}

function cleanAccountName(name: string): string {
  return String(name ?? "").replace(/^NEW:\s*/, "").trim();
}
