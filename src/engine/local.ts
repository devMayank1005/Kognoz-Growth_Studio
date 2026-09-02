/**
 * Local intents (PRD §4.4) — the questions answered with zero model calls.
 *
 * This is checked FIRST on every message, always. These are a large share of
 * real traffic ("pipeline", "what's due today"), they are answerable exactly
 * from state we already hold, and sending them to a model would be slower,
 * costlier, and less correct.
 *
 * Parsing only. Execution lives in the route handler, so this file stays pure
 * and testable.
 */

import { BENCHED_MARKETS } from "@/domain/scoring";

export type Intent =
  | { kind: "pipeline"; groupBy?: "practice" | "geography" | "solution" | "stage" }
  | { kind: "due" }
  | { kind: "openFirst" }
  | { kind: "market"; market: string }
  | { kind: "add"; company: string; solution?: string; value?: number }
  | { kind: "sweep" };

/** Markets in scope, with the aliases an operator actually types. */
const MARKET_ALIASES: ReadonlyArray<readonly [string, RegExp]> = [
  ["India", /\bindia\b/],
  ["Philippines", /\bphilippines\b|\bph\b|\bmanila\b/],
  ["Malaysia", /\bmalaysia\b|\bkl\b|\bkuala lumpur\b/],
  ["Indonesia", /\bindonesia\b|\bjakarta\b/],
  ["Vietnam", /\bvietnam\b/],
  ["Singapore", /\bsingapore\b/],
  ["UAE", /\buae\b|\bdubai\b|\babu dhabi\b|\bemirates\b/],
  ["Saudi Arabia", /\bsaudi\b|\bksa\b|\briyadh\b/],
];

/**
 * Words that follow "add" in ordinary conversation. Without this, "add more
 * detail" would be parsed as a company called "more detail" and silently
 * create a pipeline card.
 */
const NOT_A_COMPANY = /^(a|an|the|more|some|another|that|this|it|them|these|those|his|her|their|my|our)\b/i;

/** "300K" · "$1.5M" · "75,000" → a number of dollars. */
export function parseMoney(raw: string): number | undefined {
  const s = raw.trim().replace(/[$,\s]/g, "");
  if (!s) return undefined;
  const m = /^(\d+(?:\.\d+)?)([kKmM])?$/.exec(s);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const suffix = m[2]?.toLowerCase();
  if (suffix === "k") return Math.round(n * 1_000);
  if (suffix === "m") return Math.round(n * 1_000_000);
  return Math.round(n);
}

export function matchIntent(query: string): Intent | null {
  const q = query.trim();
  if (!q) return null;
  const s = q.toLowerCase();

  // add {company} [for {solution}] [at {value}]
  const addMatch = /^add\s+(.+)$/i.exec(q);
  if (addMatch) {
    const rest = addMatch[1].trim();
    if (NOT_A_COMPANY.test(rest)) return null;

    const withValue = /^(.*?)\s+at\s+([$\d][\d.,kKmM]*)$/.exec(rest);
    const beforeValue = withValue ? withValue[1].trim() : rest;
    const value = withValue ? parseMoney(withValue[2]) : undefined;

    const withSolution = /^(.*?)\s+for\s+(.+)$/i.exec(beforeValue);
    const company = (withSolution ? withSolution[1] : beforeValue).trim();
    const solution = withSolution ? withSolution[2].trim() : undefined;

    if (!company || NOT_A_COMPANY.test(company)) return null;
    return { kind: "add", company, solution, value };
  }

  if (/^(run|re-?run)\s+the\s+sweep(\s+again)?$/.test(s)) return { kind: "sweep" };

  const grouped = /^pipeline\s+by\s+(practice|geography|solution|stage)$/.exec(s);
  if (grouped) {
    return { kind: "pipeline", groupBy: grouped[1] as "practice" | "geography" | "solution" | "stage" };
  }
  if (/^(pipeline|pipeline health|how('s| is) (the |my )?pipeline)\??$/.test(s)) {
    return { kind: "pipeline" };
  }

  if (/^(what('s| is) due( today)?|due today|follow[- ]?ups?)\??$/.test(s)) return { kind: "due" };

  if (/^(who (should|do) i open first|open first|top leads?|best leads?)( today)?\??$/.test(s)) {
    return { kind: "openFirst" };
  }

  // "what's moving in {market}" — the local snapshot, NOT a research request.
  // Anything asking for news, search, or synthesis must reach the model.
  if (/\b(latest|news|search|deep|pattern|why|analys[ei]s)\b/.test(s)) return null;
  if (/^(what('s| is) (moving|happening|new)|show me|triggers?)\b/.test(s)) {
    for (const [market, pattern] of MARKET_ALIASES) {
      if (pattern.test(s)) {
        if (BENCHED_MARKETS.includes(market)) return null;
        return { kind: "market", market };
      }
    }
  }

  return null;
}
