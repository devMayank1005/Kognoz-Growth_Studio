import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { SWEEP_SYS, type SweepDefinition } from "../../prompts/sweeps";
import { PROSE_MODEL, WEB_SEARCH_TOOL, client, readUsage, webSearchError, type UsageReport } from "./client";
import { cleanSweepItems, sweepResultSchema, type CleanSweepItem } from "./sweep-schema";

/**
 * Running one sweep (PRD §4.1).
 *
 * Structured output rather than the prototype's "JSON only, no fences" +
 * parseJsonBlock. Retries twice, per §4.1; a sweep that still fails returns its
 * error rather than throwing, so one bad radar cannot lose the other ten
 * findings in a batch.
 */

export interface SweepOutcome {
  id: string;
  title: string;
  kind: "standard" | "radar";
  market?: string;
  items: CleanSweepItem[];
  /** Findings the model returned that we refused to store, with reasons. */
  dropped: string[];
  error?: string;
  /**
   * Anthropic's web search failed inside a call that still returned HTTP 200.
   *
   * Not an error — the sweep produced findings. But it produced them from the
   * model's memory rather than the live web, which is exactly why the URLs on
   * such a run look stale or invented.
   */
  webSearchDegraded?: boolean;
  usage?: UsageReport;
  latencyMs: number;
}

const MAX_ATTEMPTS = 3; // one attempt plus the two retries §4.1 asks for

/**
 * Wall-clock budget for ONE sweep, retries included.
 *
 * Every `step.run` is its own HTTP invocation of /api/inngest, so the platform's
 * function duration limit applies to a single sweep — not to the eleven-sweep
 * loop. That is what makes the loop survivable at all. But one sweep is an Opus
 * call with five web searches and, on failure, up to two more plus backoff, and
 * that can outrun the limit.
 *
 * A killed invocation is NOT the returned error this function promises. The step
 * fails, `retries` re-runs it, and when those are exhausted `daily-sweep` dies
 * with `post-morning-brief` never reached — so every other sweep's findings are
 * written but nobody is told, which is the opposite of §11's "partial results,
 * visible errors".
 *
 * So stop before the ceiling and report. 240s against the 300s declared in
 * src/app/api/inngest/route.ts; the headroom covers `persistSweep`, which runs
 * in the same step. Raise both together, never one.
 */
const BUDGET_MS = 240_000;

/**
 * Is there room for another attempt?
 *
 * Pure, so the arithmetic is testable without an Anthropic key — the impure
 * caller supplies the clock. `lastAttemptMs` is the estimator, because an
 * attempt that just took 90s is the best available evidence for what the next
 * one costs. Starting one with less than that left is how a sweep gets killed
 * instead of reported, which is the whole failure this guards.
 */
export function hasRoomForRetry(opts: {
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  lastAttemptMs: number;
  backoffMs: number;
  budgetMs: number;
}): boolean {
  if (opts.attempt >= opts.maxAttempts) return false;
  return opts.elapsedMs + opts.backoffMs + opts.lastAttemptMs <= opts.budgetMs;
}

export async function runSweep(
  sweep: SweepDefinition,
  now: Date = new Date(),
  budgetMs: number = BUDGET_MS,
): Promise<SweepOutcome> {
  const started = Date.now();
  let lastError = "";
  let attemptsMade = 0;
  let outOfBudget = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptStarted = Date.now();
    attemptsMade = attempt;
    try {
      const response = await client.messages.parse({
        model: PROSE_MODEL,
        max_tokens: 8_000,
        system: [{ type: "text", text: SWEEP_SYS, cache_control: { type: "ephemeral", ttl: "1h" } }],
        messages: [{ role: "user", content: sweep.prompt }],
        tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 5 }],
        output_config: { format: zodOutputFormat(sweepResultSchema), effort: "medium" },
      });

      const parsed = response.parsed_output;
      if (!parsed) throw new Error("sweep returned no parseable output");

      /**
       * A failed web search does NOT throw — it comes back inside a 200 as an
       * error object in `web_search_tool_result` (CLAUDE.md). The chat route
       * has always checked for this; the sweep never did, so a degraded search
       * looked like a perfectly healthy run that happened to return findings
       * the model remembered rather than looked up.
       */
      const searchError = Array.isArray(response.content)
        ? response.content.map(webSearchError).find(Boolean)
        : null;
      if (searchError) {
        console.warn(`[sweep] ${sweep.id}: web search unavailable (${searchError})`);
      }

      const { items, dropped } = cleanSweepItems(parsed.items, now);
      return {
        id: sweep.id, title: sweep.title, kind: sweep.kind, market: sweep.market,
        items, dropped,
        webSearchDegraded: Boolean(searchError),
        usage: readUsage(response.usage),
        latencyMs: Date.now() - started,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // Back off a little before retrying; a rate limit needs a moment.
      const backoffMs = attempt * 2_000;
      if (
        !hasRoomForRetry({
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          elapsedMs: Date.now() - started,
          lastAttemptMs: Date.now() - attemptStarted,
          backoffMs,
          budgetMs,
        })
      ) {
        outOfBudget = attempt < MAX_ATTEMPTS;
        break;
      }
      await sleep(backoffMs);
    }
  }

  const plural = attemptsMade === 1 ? "attempt" : "attempts";
  return {
    id: sweep.id, title: sweep.title, kind: sweep.kind, market: sweep.market,
    items: [], dropped: [],
    error: outOfBudget
      ? `stopped after ${attemptsMade} ${plural} — ${Math.round(budgetMs / 1_000)}s budget would not cover another: ${lastError}`
      : `failed after ${attemptsMade} ${plural}: ${lastError}`,
    latencyMs: Date.now() - started,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
