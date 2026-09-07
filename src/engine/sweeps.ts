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

export async function runSweep(sweep: SweepDefinition, now: Date = new Date()): Promise<SweepOutcome> {
  const started = Date.now();
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 2_000);
    }
  }

  return {
    id: sweep.id, title: sweep.title, kind: sweep.kind, market: sweep.market,
    items: [], dropped: [],
    error: `failed after ${MAX_ATTEMPTS} attempts: ${lastError}`,
    latencyMs: Date.now() - started,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
