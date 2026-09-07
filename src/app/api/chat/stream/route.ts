import type Anthropic from "@anthropic-ai/sdk";

import { loadDnc, loadPartnersByTower, loadPipeline, loadSignals, loadUniverse, loadVerifiedPeople } from "@/db/queries";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { PROGRAM_TARGET } from "@/domain/revenue";
import { rankTargets } from "@/domain/scoring";
import { curveTarget, monthOf } from "@/domain/revenue";
import { checkBudget, logModelCall } from "@/engine/budget";
import { EXTRACT_MODEL, PROSE_MODEL, engineConfigError, extractRows, readUsage, streamProse, webSearchError } from "@/engine/client";
import { matchIntent } from "@/engine/local";
import { buildLiveState } from "@/engine/state";
import {
  appendTurns,
  createConversation,
  loadConversation,
  type ConversationTurn,
} from "@/db/conversations";
import { getStudioSession } from "@/lib/session";
import { loadMoneyView } from "@/lib/money-view";
import { titleFromText } from "@/lib/titles";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The chat front door.
 *
 * Order is deliberate:
 *   1. Local intent  — answered from state, zero model calls, instant.
 *   2. Budget guard  — refuse before spending (PRD §4.1).
 *   3. Phase A       — stream prose so the operator is reading within a second.
 *   4. Phase B       — extract rows on a cheap model against a strict schema.
 *
 * Events on the wire: `state`, `delta`, `rows`, `error`, `done`.
 */
export async function POST(request: Request) {
  // 401 rather than a redirect: fetch would follow a 307 and hand the client the
  // sign-in page's HTML, which the SSE parser silently skipped — leaving the
  // turn spinning on "…" with no explanation.
  const session = await getStudioSession();
  if (!session) {
    return Response.json(
      { error: "signed-out", message: "Your session has ended. Sign in again." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as { message?: string; conversationId?: string | null };
  const message = String(body.message ?? "").trim();
  if (!message) return new Response("message is required", { status: 400 });

  /**
   * Resolve which conversation this belongs to, before streaming starts.
   *
   * `loadConversation` is scoped to the session's org AND user, so an id that
   * is missing, malformed, or somebody else's resolves to nothing and a fresh
   * conversation is created instead — the request is never refused over it and
   * never writes into a conversation the caller does not own.
   */
  let conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  let createdConversation: { id: string; title: string } | null = null;
  if (conversationId) {
    const existing = await loadConversation(session.orgId, session.userId, conversationId);
    if (!existing) conversationId = null;
  }
  if (!conversationId) {
    const title = titleFromText(message);
    conversationId = await createConversation(session.orgId, session.userId, title);
    createdConversation = { id: conversationId, title };
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      /**
       * Writes one SSE frame, tolerating a client that has gone away.
       *
       * Next aborts the stream when the browser disconnects, after which
       * `enqueue` throws "Controller is already closed". That throw used to
       * unwind the generation loop, write a spurious error row, throw again out
       * of the catch, and skip the persist entirely — so closing the tab
       * mid-answer lost the answer, which is exactly the case the persistence
       * was written for. Delivery is best-effort; the write is not.
       */
      let clientGone = false;
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          clientGone = true;
        }
      };

      /** Closing a stream the client already dropped throws too. */
      const close = () => {
        try {
          controller.close();
        } catch {
          // Already gone. The answer is saved either way.
        }
      };

      /**
       * Save the exchange so a refresh does not lose it.
       *
       * Deliberately server-side and before `controller.close()`: the operator
       * may have refreshed or closed the tab while the engine was still
       * writing, and the answer should still be waiting for them. A client-side
       * save would be lost in exactly the case that matters most.
       *
       * Never fatal — a thread that cannot be written must not take down the
       * answer the operator is already reading.
       */
      const persist = async (answer: Pick<ConversationTurn, "text" | "chart" | "rows">) => {
        try {
          const at = new Date().toISOString();
          await appendTurns(session.orgId, session.userId, conversationId, [
            { role: "user", text: message, at },
            { role: "engine", kind: "answer", at, ...answer },
          ]);
        } catch (err) {
          console.error("[chat] could not persist the turn", err);
        }
      };

      try {
        // Tell the client which conversation this landed in, so a first
        // question can put the id in the URL and title the switcher without
        // waiting for the answer to finish.
        if (createdConversation) send("conversation", createdConversation);

        // ---------------------------------------------------------- state
        const [universe, sweepItems, people, pipeline, partners, dnc, settingsRow] = await Promise.all([
          loadUniverse(session.orgId),
          loadSignals(session.orgId),
          loadVerifiedPeople(session.orgId),
          loadPipeline(session.orgId),
          loadPartnersByTower(session.orgId),
          loadDnc(session.orgId),
          db.select({ programStart: settings.programStart }).from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
        ]);

        const targets = rankTargets({
          items: sweepItems,
          universe,
          pipeline: pipeline.map((c) => ({ account: c.account, stage: c.stage })),
          history: sweepItems,
          dnc,
        });

        const programMonth = settingsRow[0] ? monthOf(settingsRow[0].programStart) : 1;
        const money = await loadMoneyView(session.orgId);
        const openValue = pipeline
          .filter((c) => !["Won", "Lost"].includes(c.stage))
          .reduce((sum, c) => sum + c.value, 0);
        const closedValue = pipeline.filter((c) => c.stage === "Won").reduce((sum, c) => sum + c.value, 0);

        // ------------------------------------------------- 1. local intent
        const intent = matchIntent(message);
        if (intent && intent.kind !== "add" && intent.kind !== "sweep") {
          send("state", { source: "local", intent: intent.kind });
          const local = answerLocally(intent, { targets, pipeline, programMonth, openValue, closedValue, money });
          send("delta", { text: local.text });
          send("rows", { chart: local.chart, rows: local.rows });
          send("done", { source: "local" });
          await persist({ text: local.text, chart: local.chart, rows: local.rows });
          close();
          return;
        }
        if (intent?.kind === "add" || intent?.kind === "sweep") {
          // Handled by the client as a direct action, not a chat answer.
          send("state", { source: "local", intent: intent.kind });
          send("rows", { chart: null, rows: [], action: intent });
          send("done", { source: "local" });
          close();
          return;
        }

        // Local answers still work without a key, so this check sits after
        // them: a misconfigured server should cost the operator as little as
        // possible, not black out the whole chat.
        if (engineConfigError) {
          send("error", {
            message: `The engine is not configured on the server: ${engineConfigError} Local questions — pipeline, what's due today, who to open first — still work.`,
          });
          send("done", { source: "error" });
          close();
          return;
        }

        // ------------------------------------------------- 2. budget guard
        const budget = await checkBudget(session.orgId);
        if (!budget.allowed) {
          send("error", {
            message: `Daily model budget reached (${budget.used}/${budget.budget}). Local questions — pipeline, what's due today, who to open first — still work.`,
          });
          send("done", { source: "budget" });
          close();
          return;
        }

        const liveState = buildLiveState({
          targets,
          people,
          pipeline: pipeline.map((c) => ({
            account: c.account,
            stage: c.stage,
            value: c.value,
            partner: c.partner,
            next: c.next,
            due: c.due,
            touches: c.touches,
          })),
          partnersByTower: partners,
          programMonth,
          pipelineValue: openValue,
          closedValue,
          target: Math.round(curveTarget(programMonth)) || PROGRAM_TARGET,
          // So the model's prose matches the screen the operator is reading.
          // Note this changes the cached prompt prefix, so the first request
          // after a currency switch misses the prompt cache once.
          baseCurrency: money.base,
          displayCurrency: money.display,
          fxRate: money.rate,
        });

        send("state", { source: "engine", targets: targets.length, budget });

        // ------------------------------------------------------ 3. Phase A
        const started = Date.now();
        let prose = "";
        let proseUsage: Anthropic.Messages.Usage | undefined;

        try {
          const proseStream = streamProse({
            liveState,
            messages: [{ role: "user", content: message }],
          });

          for await (const event of proseStream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              prose += event.delta.text;
              send("delta", { text: event.delta.text });
            }
            // Reasoning summary — shown as progress, never as the answer.
            if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
              send("thinking", { text: event.delta.thinking });
            }
            // Web search is the slowest thing the engine does; say so rather
            // than leaving the panel blank for tens of seconds.
            if (event.type === "content_block_start" && event.content_block.type === "server_tool_use") {
              send("searching", { query: (event.content_block.input as { query?: string })?.query ?? "" });
            }
            // Web search failures come back as HTTP 200 with an error object
            // inside the result block — they never throw.
            if (event.type === "content_block_start") {
              const code = webSearchError(event.content_block);
              if (code) send("error", { message: `Web search unavailable (${code}); answering from what we hold.` });
            }
          }

          const final = await proseStream.finalMessage();
          proseUsage = final.usage;
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await logModelCall({ orgId: session.orgId, kind: "chat_prose", model: PROSE_MODEL, error: detail });
          send("error", { message: "The engine could not answer that. Try again." });
          send("done", { source: "error" });
          close();
          return;
        }

        const usage = readUsage(proseUsage);
        await logModelCall({
          orgId: session.orgId,
          kind: "chat_prose",
          model: PROSE_MODEL,
          usage,
          latencyMs: Date.now() - started,
        });

        // Cache proof, visible in dev without extra tooling.
        if (process.env.NODE_ENV !== "production") {
          console.log(
            `[cache] read=${usage.cacheReadTokens} write=${usage.cacheWriteTokens} in=${usage.inputTokens}`,
          );
        }

        // ------------------------------------------------------ 4. Phase B
        let answerChart: ConversationTurn["chart"] = null;
        let answerRows: ConversationTurn["rows"] = [];
        try {
          const extractStarted = Date.now();
          const { extraction, usage: extractUsage } = await extractRows({ prose, liveState });
          await logModelCall({
            orgId: session.orgId,
            kind: "chat_extract",
            model: EXTRACT_MODEL,
            usage: extractUsage,
            latencyMs: Date.now() - extractStarted,
          });
          answerChart = extraction.chart;
          answerRows = extraction.rows;
          send("rows", { chart: extraction.chart, rows: extraction.rows });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await logModelCall({ orgId: session.orgId, kind: "chat_extract", model: EXTRACT_MODEL, error: detail });
          // Loud, not silent: the prose stands, but the operator is told the
          // action table is missing rather than being shown an empty one.
          send("error", { message: "The answer is above, but the action table could not be built." });
        }

        // Persist BEFORE announcing completion: the write is the guarantee,
        // the frame is only a courtesy to a client that may no longer be there.
        // The prose stands even when extraction failed, so persist either way.
        await persist({ text: prose, chart: answerChart, rows: answerRows });
        send("done", { source: "engine", cacheRead: usage.cacheReadTokens });
        close();
      } catch (err) {
        console.error("[chat] stream failed", err);
        send("error", { message: "Something went wrong." });
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/* ------------------------------------------------------------------ local */

import type { Intent } from "@/engine/local";
import type { Target } from "@/domain/scoring";
import type { PipelineCardRow } from "@/db/queries";
import { practiceById, practiceForTarget } from "@/domain/practices";
import { TIER_VALUE } from "@/domain/routing";
import { viewMoney, type MoneyView } from "@/domain/money";


function rowFromTarget(t: Target) {
  // See brief.ts — AMS is routed by age, not by signal order.
  const practice = practiceForTarget(t);
  return {
    solution: practice?.name ?? "TBD",
    company: t.name,
    contact_name: "",
    contact_title: practice?.buyer ?? "CHRO",
    country: t.country,
    industry: t.industry,
    trigger: t.evidence,
    signal: t.signal,
    // Was a hardcoded 300_000. The default lives in one place, and it is the
    // one that moves when the tiers are re-priced.
    value: TIER_VALUE.core,
    url: t.url,
  };
}

/**
 * The intents this function can actually answer. `add` and `sweep` are actions,
 * not questions, and are dispatched by the client — narrowing here means the
 * compiler enforces that rather than leaving it to a runtime check.
 */
type AnswerableIntent = Extract<Intent, { kind: "pipeline" | "due" | "openFirst" | "market" }>;

function answerLocally(
  intent: AnswerableIntent,
  ctx: {
    targets: Target[];
    pipeline: PipelineCardRow[];
    programMonth: number;
    openValue: number;
    closedValue: number;
    /** The chat prose must agree with the screen it is answering about. */
    money: MoneyView;
  },
) {
  const fmt = (n: number) => viewMoney(n, ctx.money);
  const active = ctx.pipeline.filter((c) => !["Won", "Lost"].includes(c.stage));
  const pace = curveTarget(ctx.programMonth);

  if (intent.kind === "pipeline") {
    const key =
      intent.groupBy === "geography" ? "country"
      : intent.groupBy === "stage" ? "stage"
      : intent.groupBy === "solution" || intent.groupBy === "practice" ? "practiceId"
      : "stage";
    const grouped: Record<string, number> = {};
    for (const c of active) {
      const raw = String(c[key as keyof PipelineCardRow] ?? "—");
      const label = key === "practiceId" ? (practiceById(raw)?.name ?? raw) : raw;
      grouped[label] = (grouped[label] ?? 0) + c.value;
    }
    return {
      text: `Month ${ctx.programMonth} of 18. Live pipeline ${fmt(ctx.openValue)} across ${active.length} opportunit${active.length === 1 ? "y" : "ies"}; closed ${fmt(ctx.closedValue)} against a pace of ${fmt(pace)} — ${ctx.closedValue >= pace ? "on the curve" : `behind by ${fmt(pace - ctx.closedValue)}; the curve back-loads, so build now`}.`,
      chart: Object.keys(grouped).length
        ? {
            type: "bar" as const,
            // The title said "($K)" and the values were divided by 1000 to match.
            // Both are gone: the chart carries whole amounts and the axis
            // formatter states the currency, so this cannot disagree with the
            // dashboard again.
            title: `Pipeline by ${intent.groupBy ?? "stage"}`,
            unit: "money" as const,
            data: Object.entries(grouped).map(([name, value]) => ({ name, value })),
          }
        : null,
      rows: [],
    };
  }

  if (intent.kind === "due") {
    const today = new Date().toISOString().slice(0, 10);
    const due = active.filter((c) => c.due && c.due <= today);
    return {
      text: due.length
        ? `Due today:\n${due.map((c) => `• ${c.account} — ${c.next || "move it"} (${c.stage}, ${c.partner})`).join("\n")}`
        : "Nothing due today. Go hunting.",
      chart: null,
      rows: [],
    };
  }

  if (intent.kind === "openFirst") {
    const top = ctx.targets.filter((t) => !t.inPipeline).slice(0, 6);
    return {
      text: top.length
        ? "Ranked by trigger strength and freshness — these are the doors to open first today."
        : "No fresh triggers ranked yet. Run the sweep, or ask what is moving in a market.",
      chart: null,
      rows: top.map(rowFromTarget),
    };
  }

  // market
  const inMarket = ctx.targets.filter((t) => t.country === intent.market);
  const byIndustry: Record<string, number> = {};
  for (const t of inMarket) byIndustry[t.industry] = (byIndustry[t.industry] ?? 0) + 1;

  return {
    text: inMarket.length
      ? `${intent.market}: ${inMarket.length} live trigger${inMarket.length === 1 ? "" : "s"}. Freshest first in the table. Ask "read the pattern in ${intent.market}" for a searched, synthesised view.`
      : `Nothing live in ${intent.market} right now.`,
    chart: Object.keys(byIndustry).length
      ? {
          type: "bar" as const,
          title: `${intent.market} — triggers by industry`,
          data: Object.entries(byIndustry).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value })),
        }
      : null,
    rows: inMarket.slice(0, 8).map(rowFromTarget),
  };
}
