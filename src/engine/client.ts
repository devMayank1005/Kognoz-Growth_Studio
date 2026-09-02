import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ENGINE_SYS, EXTRACT_SYS } from "../../prompts/engine";
import { engineExtractionSchema, scrubRow, type EngineExtraction } from "./schemas";

/**
 * The Claude engine.
 *
 * MODELS — do not copy these from the prototype, which is out of date:
 *   prose      claude-opus-5      (the PRD's claude-sonnet-4-6 is a retired id)
 *   extraction claude-haiku-4-5   (cheap, schema-constrained, runs after prose)
 *   websearch  web_search_20260209 (the prototype's _20250305 is superseded)
 *
 * FAST MODE is OFF. Verified 2026-09-02 against this org: "rate limit of 0 fast
 * mode input tokens per minute" — it is not enabled on the account, so making
 * it the default would mean every request 429s. It stays behind
 * ENABLE_FAST_MODE=1 so it is one env var away if access is ever granted.
 *
 * Never send `budget_tokens` or `temperature` — both are 400 errors on Opus 5.
 */

export const PROSE_MODEL = "claude-opus-5";
export const EXTRACT_MODEL = "claude-haiku-4-5";
export const WEB_SEARCH_TOOL = "web_search_20260209" as const;

const FAST_MODE_ENABLED = process.env.ENABLE_FAST_MODE === "1";

export const client = new Anthropic();

export interface UsageReport {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function readUsage(usage: Anthropic.Messages.Usage | undefined): UsageReport {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Phase A — stream the prose answer.
 *
 * Two cache breakpoints: the frozen system prompt at 1h, the live-state block
 * at 5m. Order matters — stable content must come first, or nothing caches.
 */
export function streamProse(opts: {
  liveState: string;
  messages: Anthropic.Messages.MessageParam[];
}) {
  const params: Anthropic.Messages.MessageStreamParams = {
    model: PROSE_MODEL,
    max_tokens: 8_000,
    system: [
      { type: "text", text: ENGINE_SYS, cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: opts.liveState, cache_control: { type: "ephemeral" } },
    ],
    messages: opts.messages,
    // Bounded at 2. Each search costs seconds of wall clock, and measurement
    // showed a question that fired four of them pushed first-visible-text past
    // 110s. Two is enough to verify a fact or find a name.
    tools: [{ type: WEB_SEARCH_TOOL, name: "web_search", max_uses: 2 }],
    // Effort is the dominant factor in time-to-first-token: measured ~6.0s at
    // medium versus ~2.3s at low. Medium is kept because this is judgement
    // work and 6s sits inside the PRD's 8s p50 budget; the dead air is solved
    // by streaming the reasoning summary below, not by lowering quality.
    output_config: { effort: "medium" },
    // Opus 5 defaults thinking `display` to "omitted", which reads as a long
    // silence before anything appears. Summarised reasoning gives the operator
    // something true to watch while the engine works.
    thinking: { type: "adaptive", display: "summarized" },
  };

  if (FAST_MODE_ENABLED) {
    return client.beta.messages.stream({
      ...params,
      speed: "fast",
      betas: ["fast-mode-2026-02-01"],
    } as Parameters<typeof client.beta.messages.stream>[0]);
  }

  return client.messages.stream(params);
}

/**
 * Phase B — extract the action table from the finished prose.
 *
 * Runs after Phase A completes, on a cheap model, constrained to a strict
 * schema. This is what makes the prototype's `rowsFromMentions` fallback
 * unnecessary: the response cannot come back malformed.
 */
export async function extractRows(opts: {
  prose: string;
  liveState: string;
}): Promise<{ extraction: EngineExtraction; usage: UsageReport }> {
  const response = await client.messages.parse({
    model: EXTRACT_MODEL,
    max_tokens: 4_000,
    system: EXTRACT_SYS,
    messages: [
      {
        role: "user",
        content: `${opts.liveState}\n\n---\n\nANALYST REPLY:\n${opts.prose}`,
      },
    ],
    output_config: { format: zodOutputFormat(engineExtractionSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    // Loud, not silent. The prototype's failure mode was returning zero rows
    // and looking like a legitimately empty answer.
    throw new Error("Row extraction returned no parseable output");
  }

  return {
    extraction: { chart: parsed.chart, rows: parsed.rows.map(scrubRow) },
    usage: readUsage(response.usage),
  };
}

/**
 * Web search failures arrive as HTTP 200 with an error object inside the result
 * block — they do NOT throw. A successful `content` is an array; an error
 * `content` is an object. Branch on that before indexing.
 */
export function webSearchError(block: unknown): string | null {
  if (typeof block !== "object" || block === null) return null;
  const b = block as { type?: string; content?: unknown };
  if (b.type !== "web_search_tool_result") return null;
  if (Array.isArray(b.content)) return null;
  const err = b.content as { error_code?: string } | null;
  return err?.error_code ?? "unknown_web_search_error";
}
