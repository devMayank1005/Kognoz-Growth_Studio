import { z } from "zod";

import { cleanName } from "@/domain/routing";
import { signalByCode, type Tier } from "@/domain/signals";

/**
 * What a sweep may return, and what we are willing to store.
 *
 * The schema constrains shape; `cleanSweepItems` enforces the rules a schema
 * cannot express. Sweep output is model output about the outside world — it is
 * the least trustworthy data in the system, and it writes directly into the
 * table that drives every score. It gets checked accordingly.
 */

export const sweepItemSchema = z.object({
  account: z.string().min(1).describe('Exact name from the list, or prefixed "NEW: " if not on it'),
  engine: z.enum(["Hire", "Learn"]),
  country: z.string().min(1),
  segment: z.string().describe("Short industry segment"),
  signal: z.string().describe("Signal code such as H1 or L6"),
  // No `tier` field on purpose. The ratified taxonomy is the authority on
  // tier and decay window (domain/signals.ts), so asking the model for one we
  // would then discard costs tokens and invites the prompt and the ranking to
  // disagree.
  headline: z.string().max(120),
  evidence: z.string().describe("One sentence carrying the specific number or fact"),
  url: z.string().describe("Source URL"),
  date: z.string().describe("YYYY-MM-DD"),
  confidence: z.enum(["high", "medium", "low"]),
});

export const sweepResultSchema = z.object({
  items: z.array(sweepItemSchema).max(6),
});

export type RawSweepItem = z.infer<typeof sweepItemSchema>;

export interface CleanSweepItem {
  account: string;
  /** True when the sweep found a company not already in the universe. */
  isNew: boolean;
  engine: "Hire" | "Learn";
  country: string;
  segment: string;
  signal: string;
  tier: Tier;
  headline: string;
  evidence: string;
  url: string;
  date: string;
  confidence: number;
}

const CONFIDENCE_SCORE = { high: 90, medium: 60, low: 30 } as const;

/** Same rule as the chat extractor — §8 applies to sweep output identically. */
const CONTACT_SHAPED = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+|00)\d[\d\s().-]{6,}/g;
const stripContacts = (s: string) => s.replace(CONTACT_SHAPED, "").replace(/\s{2,}/g, " ").trim();

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CleanResult {
  items: CleanSweepItem[];
  /** Human-readable reason per dropped finding. Logged, never swallowed. */
  dropped: string[];
}

export function cleanSweepItems(raw: readonly RawSweepItem[], now: Date = new Date()): CleanResult {
  const items: CleanSweepItem[] = [];
  const dropped: string[] = [];
  const today = now.toISOString().slice(0, 10);

  for (const r of raw) {
    const account = cleanName(r.account);
    if (!account) {
      dropped.push("finding with no account name");
      continue;
    }

    // The taxonomy is the authority on tier and decay window. A code we do not
    // recognise cannot be scored, so it cannot be stored.
    const signal = signalByCode(r.signal);
    if (!signal) {
      dropped.push(`${account}: unknown signal code "${r.signal}" — not in the ratified taxonomy`);
      continue;
    }

    if (!ISO_DATE.test(r.date) || Number.isNaN(Date.parse(r.date))) {
      dropped.push(`${account}: unparseable date "${r.date}"`);
      continue;
    }
    if (r.date > today) {
      dropped.push(`${account}: date "${r.date}" is in the future`);
      continue;
    }

    // Every fact carries a source (§9.5). A finding we cannot attribute is not
    // intelligence, it is an assertion.
    const url = r.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      dropped.push(`${account}: no usable source url`);
      continue;
    }

    items.push({
      account,
      isNew: /^NEW:/i.test(r.account.trim()),
      engine: r.engine,
      country: r.country.trim(),
      segment: r.segment.trim(),
      signal: signal.code,
      // Taken from the taxonomy, never from the model.
      tier: signal.tier,
      headline: stripContacts(r.headline),
      evidence: stripContacts(r.evidence),
      url,
      date: r.date,
      confidence: CONFIDENCE_SCORE[r.confidence],
    });
  }

  return { items, dropped };
}
