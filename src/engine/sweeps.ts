import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { SWEEP_SYS, type SweepDefinition } from "../../prompts/sweeps";
import { PROSE_MODEL, WEB_SEARCH_TOOL, client, readUsage, type UsageReport } from "./client";
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

      const { items, dropped } = cleanSweepItems(parsed.items, now);
      return {
        id: sweep.id, title: sweep.title, kind: sweep.kind, market: sweep.market,
        items, dropped,
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
