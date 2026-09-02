/**
 * The scheduled sweeps (PRD §4.1), ported from the prototype's SWEEP_SYS,
 * makeSweeps and makeRadar.
 *
 * Two corrections while porting:
 *
 * 1. The prototype hand-listed the signal taxonomy inside the prompt string,
 *    where it could drift from the taxonomy the ranking actually uses. It is
 *    now generated from src/domain/signals.ts, so the prompt and the scoring
 *    cannot disagree about what H5 or L6 mean.
 * 2. "Respond ONLY with JSON, no fences" is gone. Structured outputs make the
 *    shape a guarantee rather than a request — and that instruction is exactly
 *    what the prototype's parseJsonBlock existed to cope with.
 */

import { SIGNALS } from "@/domain/signals";
import { ICP, REGIONS } from "./engine";

const TAXONOMY = SIGNALS.map((s) => `${s.code} (tier ${s.tier}) ${s.description}`).join(" · ");

export const SWEEP_SYS = `You are the automated sweep engine of the Kognoz + Konverz Growth Engine (${REGIONS}).

Run the web searches described and return findings as structured items.

SIGNAL TAXONOMY — use only these codes: ${TAXONOMY}

ENGINE: "Hire" = a volume-hiring organisation (bank, insurer, NBFC, BPO, GCC, retail/QSR, aviation). "Learn" = a conglomerate or enterprise for leadership, org, culture, succession, or HR-transformation work.

ICP: ${ICP}

RULES
- Look back roughly 60 days unless a prompt says otherwise. News indexing lags, so a strict 30-day cut misses real moves.
- Search thoroughly before concluding. These are large, active markets; 3 to 6 well-sourced findings is the normal outcome for a sweep. An empty result should be rare, and means the searches genuinely surfaced nothing that fits — not that a finding was merely imperfect.
- Every finding needs a real source URL and the date the thing happened. If a company is clearly making a move but you cannot source it, leave that one out and keep the rest.
- Maximum 6 findings, best first.
- Companies not on the provided list are welcome and valuable: prefix the name with "NEW: " and fill in engine, country and segment.
- Never fabricate a company, a date, a number, or a signal code.
- Never include an email address, phone number, or any personal contact detail in any field. Stakeholder facts are name, title, company, date, and public source only.`;

export interface SweepDefinition {
  id: string;
  title: string;
  kind: "standard" | "radar";
  market?: string;
  prompt: string;
}

/** The 6 standard sweeps (PRD §4.1). */
export function makeSweeps(universe: ReadonlyArray<{ name: string; engine?: string; country?: string }>): SweepDefinition[] {
  const namesBy = (f: (a: { name: string; engine?: string; country?: string }) => boolean, limit: number) =>
    universe.filter(f).map((a) => a.name).join("; ").slice(0, limit);

  const gulf = (a: { country?: string }) => ["UAE", "Saudi Arabia"].includes(a.country ?? "");

  return [
    {
      id: "leaders", title: "leadership moves", kind: "standard",
      prompt: `Search for newly appointed CHROs, Chief People Officers, CLOs, or Heads of Talent Acquisition at large companies in ${REGIONS}. Map to H5 (volume hirers) or L1 (conglomerates). Priority list: ${namesBy(() => true, 1500)}`,
    },
    {
      id: "hiring", title: "hiring & expansion", kind: "standard",
      prompt: `Search for recent mass-hiring announcements, branch-expansion or store-opening plans by banks, insurers, NBFCs, QSR and retail chains in India, Philippines, Malaysia, Indonesia, Vietnam, or Singapore. Signals: H1, H4, H11. Priority list: ${namesBy((a) => a.engine === "Hire" && !gulf(a), 1200)}`,
    },
    {
      id: "congl", title: "conglomerate & family moves", kind: "standard",
      prompt: `Search for recent M&A, demergers, restructurings, next-generation succession moves or new professional CEOs at large conglomerates in India, Philippines, Malaysia, Indonesia, Vietnam, Singapore. Signals: L3, L3b, L4, L8, L10. Priority list: ${namesBy((a) => a.engine === "Learn" && !gulf(a), 1200)}`,
    },
    {
      id: "capability", title: "capability, HCM go-lives & AMS windows", kind: "standard",
      prompt: `Search for recent leadership-academy launches, HCM/HRMS selections and go-lives (Darwinbox especially, also Workday, SuccessFactors, Cornerstone, Oracle), skills-based organization announcements, and enterprise AI programs in India, Southeast Asia, or the Gulf. Signals: L2, L6, L7, L13. ALSO find companies that went live on Darwinbox or another major HCM 6-18 MONTHS AGO (signal L6, use the go-live date as the date) — these are post-implementation AMS prospects. Priority list: ${namesBy((a) => a.engine === "Learn", 1200)}`,
    },
    {
      id: "succession", title: "CXO exits", kind: "standard",
      prompt: `Search for recently announced CEO, CFO, COO or other CXO retirements, resignations or exits at large enterprises in ${REGIONS}, especially where no successor has been named. Signal: L15, also L4 if the business is family-led. Priority list: ${namesBy((a) => a.engine === "Learn", 1200)}`,
    },
    {
      id: "gulf", title: "Gulf (UAE + KSA)", kind: "standard",
      prompt: `Search for recent Gulf news: Emiratisation/Nafis and Saudisation/Nitaqat targets and deadlines, Vision 2030 giga-project hiring (NEOM, Red Sea, Diriyah), major hiring or expansion by Gulf banks, developers, airlines and retail groups, and leadership changes at family conglomerates and national champions in the UAE and Saudi Arabia. Signals: H7, H1, H4, L4, L5, L11, L15. Priority list: ${namesBy(gulf, 1500)}`,
    },
  ];
}

/** The daily market radars — hunt the whole market, no priority list (PRD §4.1). */
export function makeRadar(
  markets: readonly string[],
  universe: ReadonlyArray<{ name: string }>,
): SweepDefinition[] {
  const known = universe.map((a) => a.name).join("; ").slice(0, 800);

  return markets.map((market) => ({
    id: `radar-${market.toLowerCase().replace(/\s+/g, "-")}`,
    title: `${market} radar`,
    kind: "radar" as const,
    market,
    prompt: `MARKET RADAR — ${market}. Hunt across the ENTIRE ${market} market for companies with fresh buying triggers, INCLUDING and especially companies not on our list. Only companies meeting the ICP.

Search the last ~30 days for: mass hiring or 500+ open roles; a new GCC, captive or regional HQ; ${["UAE", "Saudi Arabia"].includes(market) ? "nationalisation quota pressure; " : ""}a new CHRO or CLO at a scale employer; M&A or demerger; a family IPO, PE investment or succession; a leadership academy or HCM go-live (Darwinbox especially); a mega-project or major plant.

Prefix every company not on the known list with "NEW: " and classify its engine, country and segment. Known companies to skip: ${known}`,
  }));
}
