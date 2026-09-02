import type Anthropic from "@anthropic-ai/sdk";

import { loadDnc, loadPartnersByTower, loadPipeline, loadSignals, loadUniverse, loadVerifiedPeople } from "@/db/queries";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { PROGRAM_TARGET } from "@/domain/revenue";
import { rankTargets } from "@/domain/scoring";
import { curveTarget, monthOf } from "@/domain/revenue";
import { checkBudget, logModelCall } from "@/engine/budget";
import { EXTRACT_MODEL, PROSE_MODEL, extractRows, readUsage, streamProse, webSearchError } from "@/engine/client";
import { matchIntent } from "@/engine/local";
import { buildLiveState } from "@/engine/state";
import { requireSession } from "@/lib/session";
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
  const session = await requireSession();

  const body = (await request.json()) as { message?: string };
  const message = String(body.message ?? "").trim();
  if (!message) return new Response("message is required", { status: 400 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
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
        const openValue = pipeline
          .filter((c) => !["Won", "Lost"].includes(c.stage))
          .reduce((sum, c) => sum + c.value, 0);
        const closedValue = pipeline.filter((c) => c.stage === "Won").reduce((sum, c) => sum + c.value, 0);

        // ------------------------------------------------- 1. local intent
        const intent = matchIntent(message);
        if (intent && intent.kind !== "add" && intent.kind !== "sweep") {
          send("state", { source: "local", intent: intent.kind });
          const local = answerLocally(intent, { targets, pipeline, programMonth, openValue, closedValue });
          send("delta", { text: local.text });
          send("rows", { chart: local.chart, rows: local.rows });
          send("done", { source: "local" });
          controller.close();
          return;
        }
        if (intent?.kind === "add" || intent?.kind === "sweep") {
          // Handled by the client as a direct action, not a chat answer.
          send("state", { source: "local", intent: intent.kind });
          send("rows", { chart: null, rows: [], action: intent });
          send("done", { source: "local" });
          controller.close();
          return;
        }

        // ------------------------------------------------- 2. budget guard
        const budget = await checkBudget(session.orgId);
        if (!budget.allowed) {
          send("error", {
            message: `Daily model budget reached (${budget.used}/${budget.budget}). Local questions — pipeline, what's due today, who to open first — still work.`,
          });
          send("done", { source: "budget" });
          controller.close();
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
          controller.close();
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
          send("rows", { chart: extraction.chart, rows: extraction.rows });
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await logModelCall({ orgId: session.orgId, kind: "chat_extract", model: EXTRACT_MODEL, error: detail });
          // Loud, not silent: the prose stands, but the operator is told the
          // action table is missing rather than being shown an empty one.
          send("error", { message: "The answer is above, but the action table could not be built." });
        }

        send("done", { source: "engine", cacheRead: usage.cacheReadTokens });
        controller.close();
      } catch (err) {
        console.error("[chat] stream failed", err);
        send("error", { message: "Something went wrong." });
        controller.close();
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
import { practiceById, practicesForSignal } from "@/domain/practices";

const fmtM = (n: number) => `$${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;

function rowFromTarget(t: Target) {
  const practice = practicesForSignal(t.signal)[0];
  return {
    solution: practice?.name ?? "TBD",
    company: t.name,
    contact_name: "",
    contact_title: practice?.buyer ?? "CHRO",
    country: t.country,
    industry: t.industry,
    trigger: t.evidence,
    signal: t.signal,
    value: 300_000,
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
  ctx: { targets: Target[]; pipeline: PipelineCardRow[]; programMonth: number; openValue: number; closedValue: number },
) {
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
      grouped[label] = (grouped[label] ?? 0) + Math.round(c.value / 1000);
    }
    return {
      text: `Month ${ctx.programMonth} of 18. Live pipeline ${fmtM(ctx.openValue)} across ${active.length} opportunit${active.length === 1 ? "y" : "ies"}; closed ${fmtM(ctx.closedValue)} against a pace of ${fmtM(pace)} — ${ctx.closedValue >= pace ? "on the curve" : `behind by ${fmtM(pace - ctx.closedValue)}; the curve back-loads, so build now`}.`,
      chart: Object.keys(grouped).length
        ? { type: "bar" as const, title: `Pipeline by ${intent.groupBy ?? "stage"} ($K)`, data: Object.entries(grouped).map(([name, value]) => ({ name, value })) }
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
