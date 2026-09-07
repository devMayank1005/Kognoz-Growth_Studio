"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { addCard } from "@/app/actions/add-card";
import type { ConversationSummary, ConversationTurn } from "@/db/conversations";
import type { EngineChart, EngineRow } from "@/engine/schemas";
import { viewMoney, type MoneyView } from "@/domain/money";
import { formatStamp } from "@/lib/clock";
import { runSweep } from "@/lib/run-sweep";
import { useWorkspace } from "@/store/selection";

import { ActionTable } from "./action-table";
import { ConversationSwitcher } from "./conversation-switcher";
import { Prose } from "./prose";

/**
 * Recharts is 366 KB and most answers have no chart, but a static import put it
 * in the first load of `/chat` — which is where `/` redirects, so it was the
 * price of opening the app. Loaded on the first answer that actually has one.
 */
const EngineChartBlock = dynamic(() => import("./engine-chart").then((m) => m.EngineChartBlock), {
  loading: () => <div className="mt-4 h-40 animate-pulse rounded bg-panel" aria-label="Loading chart" />,
});

interface Turn {
  /** Stable across re-renders, so the list is not keyed by array index. */
  id: string;
  role: "user" | "engine";
  /** "brief" gets the §9.9 headline treatment; everything else is an answer. */
  kind?: "brief" | "answer";
  /**
   * When the turn was written. Optional because a turn created client-side
   * mid-stream has none — and those are never briefs, which is the only place
   * it is read.
   */
  at?: string;
  text: string;
  chart?: EngineChart | null;
  rows?: EngineRow[];
  /** True while Phase B is still running, so the table slot shows a skeleton. */
  awaitingRows?: boolean;
  /** Live progress while the engine reasons or searches — never the answer. */
  progress?: string;
  error?: string;
  source?: "local" | "engine";
}

/** `add Emaar for Hire at 3cr` — a direct action, not a chat answer. */
async function runAddIntent(
  action: { company: string; solution?: string; value?: number },
  money: MoneyView,
): Promise<string> {
  const result = await addCard(
    {
      company: action.company,
      solution: action.solution ?? "Organization Transformation",
      value: action.value,
      contact_name: "",
      contact_title: "",
      country: "",
      industry: "",
      trigger: "Added directly by the operator",
      signal: "",
      url: "",
    },
    // Operator intent skips Prospect and opens Tagged (PRD §5).
    { stage: "Plan reach-out" },
  );

  if (result.ok) {
    const summary = `${result.practice} · ${result.tower} · ${result.partner} · ${viewMoney(result.value, money)} · Tagged`;
    toast.success(`${result.account} added`, { description: summary });
    return `Added ${result.account} — ${summary}.`;
  }
  toast.error(result.message);
  return result.message;
}

const SUGGESTIONS = [
  "what's moving in UAE",
  "who should I open first",
  "pipeline by stage",
  "what's due today",
];

export function Chat({
  conversations,
  conversationId,
  initialTurns,
  money,
}: {
  conversations: ConversationSummary[];
  /** Null only for an operator who has never asked anything. */
  conversationId: string | null;
  initialTurns: ConversationTurn[];
  money: MoneyView;
}) {
  const params = useSearchParams();
  const router = useRouter();

  // History arrives server-rendered. It used to be fetched from /api/thread in
  // a mount effect, which meant html -> hydrate -> fetch -> render before the
  // operator saw yesterday's brief, and an unconditional setTurns that could
  // land mid-send and wipe the turns already on screen.
  const [turns, setTurns] = useState<Turn[]>(() =>
    initialTurns.map((t, i) => ({ ...t, id: `h${i}-${t.at}` })),
  );

  // ⌘K hands a typed question through as ?q= so the operator does not have to
  // navigate here and retype it (§9.9). Otherwise the composer picks up the
  // draft the operator was part-way through when the page last unloaded.
  const draft = useWorkspace((s) => s.draft);
  const setDraft = useWorkspace((s) => s.setDraft);
  const handover = params.get("q");
  // Bound to the draft, NOT to the search param. Reading `handover ?? draft`
  // re-derived from the URL on every render, so typing did nothing and the
  // question reappeared after sending with Ask still enabled — one click from a
  // duplicate Opus call. The effect below is the only thing that consumes it.
  const input = draft;
  const setInput = useCallback(
    (value: string) => {
      setDraft(value);
    },
    [setDraft],
  );

  const [busy, setBusy] = useState(false);
  /**
   * The conversation being written to. Starts as the server's choice and is
   * filled in from the stream's `conversation` frame when the first question of
   * a brand-new conversation creates one.
   */
  const currentIdRef = useRef(conversationId);
  const endRef = useRef<HTMLDivElement>(null);
  /** The turn list, watched so late-loading content cannot strand the view. */
  const contentRef = useRef<HTMLDivElement>(null);
  /** The scroller itself, so the opening jump can set scrollTop outright. */
  const scrollerRef = useRef<HTMLDivElement>(null);
  /** False once the operator scrolls up to read — do not yank them back down. */
  const pinnedRef = useRef(true);
  const rafRef = useRef<number | null>(null);

  // Genuinely a one-shot now: fold ?q= into the draft and clear it from the URL,
  // so nothing can re-apply it.
  useEffect(() => {
    if (!handover) return;
    setDraft(handover);
    // Keep ?c= — dropping it would bounce the operator out of the conversation
    // they are reading and back to the default one.
    router.replace(currentIdRef.current ? `/chat?c=${currentIdRef.current}` : "/chat", { scroll: false });
  }, [handover, setDraft, router]);

  /**
   * Scrolling is coalesced into one frame. This used to fire a smooth
   * scrollIntoView per streamed token, stacking hundreds of competing
   * animations that cancelled each other and thrashed the scroller.
   */
  const scrollToEnd = useCallback(() => {
    if (!pinnedRef.current || rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }, []);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  /**
   * Open at the latest turn, not the oldest.
   *
   * Server-rendered history meant a refresh landed at the top of the
   * conversation, so the answer the operator had just been reading was several
   * screens below and looked lost — indistinguishable from the turn genuinely
   * not having been saved.
   *
   * A single jump on mount is not enough: the chart is a `next/dynamic` import,
   * so it arrives *after* this runs and grows the page by its own height,
   * pushing the end back below the fold. Observing the content instead keeps
   * the view at the end until the operator scrolls up — `pinnedRef` is already
   * how "they are reading, leave them alone" is tracked, so late-arriving
   * content is handled by the same rule as streaming text.
   */
  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    // scrollTop, not scrollIntoView: the latter walks up to the nearest
    // scrollable ancestor and was competing with the router's own scroll
    // handling, leaving the view at the top of the conversation.
    const jump = () => {
      const el = scrollerRef.current;
      if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
    };

    /**
     * Deferred a frame: the App Router restores scroll position after this
     * effect runs, so jumping synchronously here is immediately undone.
     *
     * Unconditional, unlike `jump`. That restoration scrolls to the top, which
     * fires `onScroll`, which sets `pinnedRef` to false because the end is now
     * far below — so a pinned check here would disable the very jump that is
     * meant to undo it. Pinning is re-armed straight after, and the observer
     * below honours it from then on.
     */
    const frame = requestAnimationFrame(() => {
      const el = scrollerRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      pinnedRef.current = true;
    });
    const observer = new ResizeObserver(jump);
    observer.observe(content);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  const send = useCallback(async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);

    // Patch by id, not by a position computed from the render closure: the old
    // `turns.length + 1` was a bet that nothing else had appended in between.
    const engineId = `e${Date.now()}`;
    pinnedRef.current = true;
    setTurns((t) => [
      ...t,
      { id: `u${Date.now()}`, role: "user", text },
      { id: engineId, role: "engine", text: "", awaitingRows: true },
    ]);
    scrollToEnd();

    const patch = (fn: (turn: Turn) => Turn) =>
      setTurns((t) => t.map((turn) => (turn.id === engineId ? fn(turn) : turn)));

    /** Set when this question created its conversation; navigated to at the end. */
    let created: string | null = null;

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversationId: currentIdRef.current }),
      });

      // 401 is the session ending, not an engine failure. Say so and offer the
      // way back, rather than leaving the turn on "…" forever.
      if (response.status === 401) {
        patch((turn) => ({
          ...turn,
          awaitingRows: false,
          error: "Your session has ended. Sign in again to continue.",
        }));
        return;
      }

      if (!response.ok || !response.body) throw new Error(`stream failed: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by a blank line.
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
          const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.slice(7).trim();
          const data = JSON.parse(dataLine.slice(6));

          if (event === "conversation") {
            // A conversation was created for this question. Adopt it now so a
            // follow-up appends instead of creating another, but leave the URL
            // alone until the stream ends: `/chat?c=` changes the page's key,
            // which would remount this component and wipe the answer still
            // being streamed into it.
            currentIdRef.current = data.id;
            created = data.id;
          } else if (event === "delta") {
            patch((turn) => ({ ...turn, text: turn.text + data.text, progress: undefined }));
            scrollToEnd();
          } else if (event === "thinking") {
            patch((turn) => ({ ...turn, progress: "Thinking…" }));
          } else if (event === "searching") {
            patch((turn) => ({
              ...turn,
              progress: data.query ? `Searching the web — ${data.query}` : "Searching the web…",
            }));
          } else if (event === "rows") {
            if (data.action?.kind === "add") {
              // A direct action, not a question. The turn reports what it did
              // rather than sitting on an empty "…" bubble.
              patch((turn) => ({ ...turn, awaitingRows: false, text: `Adding ${data.action.company}…` }));
              void runAddIntent(data.action, money).then((line) =>
                patch((turn) => ({ ...turn, text: line })),
              );
            } else if (data.action?.kind === "sweep") {
              // The route dispatches this as a client action but nothing handled
              // it, so "run the sweep again" produced a permanently blank bubble
              // and started no sweep.
              patch((turn) => ({ ...turn, awaitingRows: false, text: "Starting the sweep…" }));
              void runSweep().then((line: string) => patch((turn) => ({ ...turn, text: line })));
            } else {
              patch((turn) => ({ ...turn, chart: data.chart, rows: data.rows, awaitingRows: false }));
            }
            scrollToEnd();
          } else if (event === "state") {
            patch((turn) => ({ ...turn, source: data.source }));
          } else if (event === "error") {
            patch((turn) => ({ ...turn, error: data.message, awaitingRows: false }));
          } else if (event === "done") {
            patch((turn) => ({ ...turn, awaitingRows: false }));
          }
        }
      }
    } catch {
      patch((turn) => ({ ...turn, error: "The engine could not answer that." }));
    } finally {
      // Belt and braces: whatever happened above, this turn must not be left
      // spinning on "…".
      patch((turn) => (turn.awaitingRows ? { ...turn, awaitingRows: false } : turn));
      setBusy(false);
      scrollToEnd();

      // Safe here and not earlier: the route persists the exchange before it
      // sends `done`, so the remount this triggers renders the same turns back
      // from the server rather than losing them.
      if (created) router.replace(`/chat?c=${created}`, { scroll: false });
    }
  }, [busy, setInput, scrollToEnd, router, money]);


  return (
    <div className="flex h-full flex-col">
      <ConversationSwitcher conversations={conversations} currentId={conversationId} />
      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-6 py-8"
        onScroll={(e) => {
          const el = e.currentTarget;
          pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div ref={contentRef} className="mx-auto max-w-3xl">
          {turns.length === 0 && <EmptyState onPick={send} />}

          <AnimatePresence initial={false}>
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} money={money} />
            ))}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="shrink-0 border-t border-line bg-surface px-6 py-3"
      >
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={`Ask the engine, or type: add Emaar for Hire at ${money.base === "INR" ? "3cr" : "300K"}`}
            aria-label="Ask the engine"
            className="flex-1 rounded border border-line bg-canvas px-3 py-2 text-[13px] text-body placeholder:text-faint disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded bg-accent px-3 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * One turn, memoized.
 *
 * While an answer streams, `patch` replaces only the streaming turn's object,
 * so every other turn keeps its identity and this re-render is skipped. Without
 * it, a 200-turn thread re-rendered every Motion component on every token.
 */
const TurnView = memo(function TurnView({ turn, money }: { turn: Turn; money: MoneyView }) {
  if (turn.role === "user") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex justify-end">
        <p className="max-w-[80%] rounded bg-panel px-3 py-2 text-[13px] text-body">{turn.text}</p>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
      {/* §9.5 — the cyan hairline marks this block as engine-authored. */}
      <div className="engine-mark">
        {turn.kind === "brief" && (
          <p className="mb-1 flex flex-wrap items-baseline gap-x-2 font-display text-[13px] tracking-tight text-body">
            Morning brief
            {/* The stamp answers the question the operator actually has: is
                this today's? It reads ~06:00 rather than the 05:30 the cron
                fires, because the brief is written after eleven model calls —
                which is the more useful number: when the intelligence was
                finished, not when the job was queued.

                `formatStamp`, never toLocaleString. That is the function whose
                absence produced a hydration mismatch which wiped the saved
                theme off <html> on every load. */}
            {turn.at && (
              <span className="font-sans text-[11px] font-normal tracking-normal text-faint">
                {formatStamp(turn.at)}
              </span>
            )}
          </p>
        )}
        {/* Progress is the engine working, not its answer. It is replaced the
            moment real text arrives. */}
        {!turn.text && turn.progress && (
          <p className="flex items-center gap-2 text-[13px] text-faint">
            <span className="size-1.5 animate-pulse rounded-full bg-cyan" />
            {turn.progress}
          </p>
        )}
        {/* Rendered, not printed: the engine writes light markdown, and as flat
            text its **bold** reached the operator as literal asterisks. */}
        {turn.text && <Prose text={turn.text} />}
        {!turn.text && !turn.progress && !turn.error && <p className="text-[13px] text-faint">…</p>}
        {turn.chart && <EngineChartBlock chart={turn.chart} money={money} />}
        {turn.awaitingRows && turn.text && <RowSkeleton />}
        {turn.rows && turn.rows.length > 0 && <ActionTable rows={turn.rows} money={money} />}
        {turn.error && <p className="mt-2 text-[13px] text-amber">{turn.error}</p>}
      </div>
    </motion.div>
  );
});

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div>
      {/* §9.7 — an empty state teaches exactly one action. */}
      <h1 className="font-display text-xl tracking-tight text-body">What should we act on today?</h1>
      <p className="prose-chat mt-2 text-muted">
        Ask in plain language. Answers come back as prose, a chart when a comparison helps, and an
        action table where every row has one button.
      </p>
      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-full border border-line px-3 py-1 text-[13px] text-muted transition-colors duration-150 hover:border-cyan hover:text-body"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="mt-4 space-y-1.5" aria-label="Building the action table">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-row animate-pulse rounded bg-panel" />
      ))}
    </div>
  );
}
