import type { Target } from "@/domain/scoring";

/**
 * The live-state block that follows the frozen system prompt.
 *
 * THE RULE THAT MAKES CACHING WORK: this block is built against a timestamp
 * rounded down to a 5-minute bucket, never `new Date()`. The prototype
 * interpolated a changing clock into every request, which would produce a
 * byte-different prefix each time and a 0% cache hit rate — expensive and slow,
 * and invisible unless you look at `usage.cache_read_input_tokens`.
 *
 * Within a bucket the block is byte-identical, so the cache hits. Verify with
 * the cache_read counter, not by assumption.
 */

export const CACHE_BUCKET_MS = 5 * 60 * 1000;

/** Floor a time to its 5-minute bucket. Exported so tests can pin it. */
export function bucketTime(now: Date = new Date()): Date {
  return new Date(Math.floor(now.getTime() / CACHE_BUCKET_MS) * CACHE_BUCKET_MS);
}

export interface StatePerson {
  name: string;
  role: string;
  company: string;
  source: string;
}

export interface StateCard {
  account: string;
  stage: string;
  value: number;
  partner: string;
  next: string;
  due: string;
  touches: number;
}

export interface BuildStateInput {
  targets: Target[];
  people: StatePerson[];
  pipeline: StateCard[];
  partnersByTower: Record<string, string>;
  programMonth: number;
  pipelineValue: number;
  closedValue: number;
  target: number;
  now?: Date;
}

const compactTargets = (targets: Target[]) =>
  targets
    .slice(0, 45)
    .map((t) =>
      [
        t.name,
        t.country,
        t.industry,
        t.signal || "radar",
        (t.evidence || "").slice(0, 110),
        t.date,
        t.relationship,
        t.ams ? "AMS" : "",
      ].join("|"),
    )
    .join("\n");

const compactPipeline = (cards: StateCard[]) =>
  cards
    .slice(0, 40)
    .map((c) => `${c.account}|${c.stage}|${c.value}|${c.partner}|${c.next}|${c.due}|touches ${c.touches}`)
    .join("\n");

const compactPeople = (people: StatePerson[]) =>
  people.slice(0, 60).map((p) => `${p.name}|${p.role}|${p.company}|${p.source}`).join("\n");

export function buildLiveState(input: BuildStateInput): string {
  const asOf = bucketTime(input.now).toISOString().slice(0, 16).replace("T", " ");

  return `LIVE STATE (as of ${asOf} UTC)

PROGRAMME: month ${input.programMonth} of 18 · open pipeline $${input.pipelineValue} · closed $${input.closedValue} · target $${input.target}

PARTNERS BY TOWER: ${Object.entries(input.partnersByTower).map(([t, p]) => `${t}=${p}`).join(" · ")}

TODAY'S TRIGGERS (company|country|industry|signal|evidence|date|relationship|ams):
${compactTargets(input.targets) || "(none)"}

VERIFIED PEOPLE (name|role|company|source) — the ONLY people you may name without searching:
${compactPeople(input.people) || "(none)"}

LIVE PIPELINE (account|stage|value|partner|next|due|touches):
${compactPipeline(input.pipeline) || "(empty)"}`;
}
