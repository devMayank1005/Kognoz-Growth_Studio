import { z } from "zod";

import { PROGRAM_TARGET } from "@/domain/revenue";
import { TIER_VALUE } from "@/domain/routing";

import { PRACTICES } from "@/domain/practices";

/**
 * Phase B output schema.
 *
 * This replaces the prototype's `ENGINE_JSON:` text tail. Because the model is
 * constrained to this shape, a malformed action table is not a failure mode we
 * have to code around — which is why the prototype's `rowsFromMentions`
 * fallback does not exist here.
 *
 * There is deliberately no field that could carry an email or phone (PRD §8).
 */

const PRACTICE_NAMES = PRACTICES.map((p) => p.name) as [string, ...string[]];

export const engineRowSchema = z.object({
  solution: z.enum(PRACTICE_NAMES).describe("Practice name, exactly as listed"),
  company: z.string().trim().min(1),
  contact_name: z.string().describe("Empty unless the person is actually named"),
  contact_title: z.string().describe("Their title, or the role to aim at"),
  country: z.string(),
  industry: z.string(),
  trigger: z.string().describe("The dated fact, and why it fits"),
  signal: z.string().describe("Signal code such as H1 or L6, or empty"),
  /**
   * A plausibility band, not a guess.
   *
   * This was `positive()`, which accepts the old dollar magnitudes — 75000,
   * 300000, 500000 — unchanged. A model still thinking in dollars would have
   * produced cards priced at a hundredth of their worth, and every one would
   * have looked like a perfectly ordinary number. The floor is the wedge value
   * precisely so all three legacy figures fall below it and are rejected;
   * `makeCard` then defaults the row to `TIER_VALUE.core` rather than storing
   * something wrong. Same move as the FX fetcher's 1–1000 sanity band.
   */
  value: z.number().int().min(TIER_VALUE.wedge).max(PROGRAM_TARGET / 4),
  url: z.string().describe("Source URL, or empty"),
});

export const engineChartSchema = z.object({
  type: z.enum(["bar", "line"]),
  title: z.string(),
  data: z.array(z.object({ name: z.string(), value: z.number() })).max(8),
  /**
   * Whether the values are money or a count of things.
   *
   * Optional and defaulting to counts, because most charts count triggers. The
   * pipeline chart used to dodge this by pre-dividing every value by 1000 and
   * putting "($K)" in the title — which hardcoded dollars into a chart axis and
   * would have read "₹K" nonsense the moment the currency changed.
   */
  unit: z.enum(["money", "count"]).optional(),
});

export const engineExtractionSchema = z.object({
  chart: engineChartSchema.nullable(),
  rows: z.array(engineRowSchema).max(8),
});

export type EngineRow = z.infer<typeof engineRowSchema>;
export type EngineChart = z.infer<typeof engineChartSchema>;
export type EngineExtraction = z.infer<typeof engineExtractionSchema>;

/**
 * Last line of defence before anything reaches the UI or the database.
 *
 * The schema cannot express "no contact details", so this does. A model that
 * ignored the instruction and put an email in `contact_name` gets it stripped
 * here rather than persisted (PRD §8).
 */
const CONTACT_SHAPED = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+|00)\d[\d\s().-]{7,}/;

export function scrubRow(row: EngineRow): EngineRow {
  const clean = (s: string) => (CONTACT_SHAPED.test(s) ? s.replace(CONTACT_SHAPED, "").trim() : s);
  return {
    ...row,
    contact_name: clean(row.contact_name),
    contact_title: clean(row.contact_title),
    trigger: clean(row.trigger),
  };
}
