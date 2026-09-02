/**
 * Industry bucketing (PRD §4.3).
 *
 * Ported from the prototype's `industryOf`. Order is significant: the first
 * matching pattern wins, so the narrow buckets are tested before the broad
 * ones. "Conglomerate & Family" sits last among the matchers because its
 * `group` token is broad enough to swallow segments the earlier rules own.
 *
 * Deviation from the prototype: Pharma & Health is tested BEFORE Industrial &
 * Energy. In the prototype's order, "pharma manufacturer" matched
 * `manufactur` and was filed as Industrial & Energy, so pharma accounts were
 * misrouted in the dashboard's industry panel. `pharma`/`health`/`hospital`
 * are the more specific signal and now win.
 */

export const INDUSTRIES = [
  "Banking",
  "Insurance",
  "NBFC & Finance",
  "BPO / GCC / IT",
  "Retail & QSR",
  "Real Estate",
  "Industrial & Energy",
  "Conglomerate & Family",
  "Pharma & Health",
  "Telecom & Tech",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

const RULES: ReadonlyArray<readonly [RegExp, Industry]> = [
  [/bank/, "Banking"],
  [/insur/, "Insurance"],
  [/nbfc|finance|fintech|payments/, "NBFC & Finance"],
  [/bpo|gbs|gcc|it services|shared service/, "BPO / GCC / IT"],
  [/qsr|retail|frontline|store|consumer|fmcg/, "Retail & QSR"],
  [/developer|real estate|property/, "Real Estate"],
  [/pharma|health|hospital/, "Pharma & Health"],
  [/giga|energy|oil|power|mining|steel|auto|manufactur|plant|industrial|infrastructure|aviation|airline/, "Industrial & Energy"],
  [/telecom|tech|high-growth|founder|digital|software/, "Telecom & Tech"],
  [/family|conglomerate|glc|holding|champion|group/, "Conglomerate & Family"],
];

export function industryOf(segment: string | null | undefined): Industry {
  const s = (segment ?? "").toLowerCase();
  for (const [pattern, industry] of RULES) if (pattern.test(s)) return industry;
  return "Other";
}
