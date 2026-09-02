/**
 * The ten practices and the four towers that own them (PRD §3, §4.2).
 *
 * A signal points at one or more practices; the practice determines the tower;
 * the tower determines the partner and the revenue target. That chain is the
 * whole routing story, and it lives here.
 */

import { TOWER_TARGETS, type TowerKey } from "./revenue";

export type Brand = "Kognoz" | "Konverz";

export interface Practice {
  id: string;
  brand: Brand;
  /** Full display name, including the product parenthetical where there is one. */
  name: string;
  /** Signal codes this practice can play. */
  signals: readonly string[];
  /** The buying pain, in the operator's own voice. */
  pain: string;
  /** One-line proof point used in drafts. */
  proofShort: string;
  buyer: string;
}

export const PRACTICES: readonly Practice[] = [
  {
    id: "hire", brand: "Konverz", name: "Hire (JobFit AI)",
    signals: ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H9", "H10", "H11"],
    pain: "volume hiring breaks screening consistency — and a public number makes it visible",
    proofShort: "Bharti AXA cut hiring time 60% and cost 40% with JobFit AI",
    buyer: "CHRO or Head of TA",
  },
  {
    id: "nurture", brand: "Konverz", name: "Nurture (Careers & Mobility)",
    signals: ["L9", "L13", "L6", "L15"],
    pain: "good people leave when they can't see a path",
    proofShort: "we built the career-mobility-succession marketplace at a national energy major",
    buyer: "CHRO",
  },
  {
    id: "learncoach", brand: "Konverz", name: "Learn + Coach",
    signals: ["L2", "L1", "L5", "L11"],
    pain: "academies fail on transfer, not content",
    proofShort: "Petronas turned passive learning into engaging growth with us",
    buyer: "CLO or CHRO",
  },
  {
    id: "skills", brand: "Konverz", name: "Skills AI",
    signals: ["L13", "L6", "L14"],
    pain: "skills-based intent with roles never mapped consistently",
    proofShort: "we mapped ~450,000 roles to skills at a global IT major",
    buyer: "CHRO / HR tech lead",
  },
  {
    id: "org", brand: "Kognoz", name: "Organization Transformation",
    signals: ["L13", "L14", "L3", "L3b", "L7"],
    pain: "fast growth, and the structure is buckling under it",
    proofShort: "we redesigned job architecture for a 150,000-person global firm",
    buyer: "CEO / COO / CHRO",
  },
  {
    id: "family", brand: "Kognoz", name: "Family Business Transformation",
    signals: ["L4", "L10", "L8"],
    pain: "the next generation isn't ready, and everything still runs through one person",
    proofShort: "we guided the second-gen transition of a 10,000-strong media group",
    buyer: "the founder or next-gen",
  },
  {
    id: "culture", brand: "Kognoz", name: "Culture & EX",
    signals: ["L3", "L9", "L8", "L12"],
    pain: "engagement scores look fine but the energy is gone",
    proofShort: "we unified values for a major group post-merger",
    buyer: "CHRO / CEO",
  },
  {
    id: "talent", brand: "Kognoz", name: "Talent & Leadership",
    signals: ["L3b", "L15", "L9", "L1"],
    pain: "a key person resigns and no one is ready to step up",
    proofShort: "we ran CEO/CXO assessment through a demerger at a multinational resources group",
    buyer: "the board / CEO / CHRO",
  },
  {
    id: "hrtx", brand: "Kognoz", name: "AI-Led HR Transformation",
    signals: ["L6", "L1", "L7"],
    pain: "HR buried in admin instead of shaping the workforce",
    proofShort: "we shifted ~1/3 of HR effort to strategic work with Konverz AI; Darwinbox implementation + AMS",
    buyer: "CHRO / CIO",
  },
  {
    id: "worktx", brand: "Kognoz", name: "Work Transformation / Human-AI",
    signals: ["L7", "L13", "L14"],
    pain: "AI pilots impress in the demo, then quietly stall",
    proofShort: "we build human-AI collaboration into role design with clear trust thresholds",
    buyer: "CEO / COO",
  },
];

export const TOWER_KEYS = ["T1", "T2", "T3", "T4"] as const;

export interface Tower {
  label: string;
  /** Short label used in dense table columns. */
  short: string;
  practices: readonly string[];
  target: number;
}

export const TOWERS: Record<TowerKey, Tower> = {
  T1: { label: "Org & Family Business", short: "Org & Family", practices: ["org", "family", "talent", "culture"], target: TOWER_TARGETS.T1 },
  T2: { label: "HR Transformation & Darwinbox", short: "HR Tx & Darwinbox", practices: ["hrtx", "worktx"], target: TOWER_TARGETS.T2 },
  T3: { label: "Konverz Hire", short: "Hire", practices: ["hire"], target: TOWER_TARGETS.T3 },
  T4: { label: "Konverz Nurture / Learn", short: "Nurture / Learn", practices: ["nurture", "learncoach", "skills"], target: TOWER_TARGETS.T4 },
};

const PRACTICE_BY_ID = new Map(PRACTICES.map((p) => [p.id, p]));

export function practiceById(id: string): Practice | undefined {
  return PRACTICE_BY_ID.get(id);
}

/** The tower that owns a practice. Defaults to T1 for an unknown practice. */
export function towerOfPractice(practiceId: string): TowerKey {
  return TOWER_KEYS.find((t) => TOWERS[t].practices.includes(practiceId)) ?? "T1";
}

/**
 * Resolve the solution string the engine emits back to a practice.
 * The engine may return either the bare name ("Hire") or the full one
 * ("Hire (JobFit AI)"), so match on prefix.
 */
export function practiceByName(name: string | null | undefined): Practice | undefined {
  const n = (name ?? "").trim();
  if (!n) return undefined;
  return PRACTICES.find((p) => p.name.startsWith(n) || n.startsWith(p.name));
}

const BY_SIGNAL = new Map<string, Practice[]>();
for (const p of PRACTICES) {
  for (const code of p.signals) {
    const list = BY_SIGNAL.get(code) ?? [];
    list.push(p);
    BY_SIGNAL.set(code, list);
  }
}

/** Every practice that can play a given signal, in declaration order. */
export function practicesForSignal(code: string): readonly Practice[] {
  return BY_SIGNAL.get(code) ?? [];
}
