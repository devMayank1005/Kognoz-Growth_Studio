"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { addCard } from "@/app/actions/add-card";
import type { EngineChart, EngineRow } from "@/engine/schemas";

import { ActionTable } from "./action-table";
import { EngineChartBlock } from "./engine-chart";

interface Turn {
  role: "user" | "engine";
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

const SUGGESTIONS = [
  "what's moving in UAE",
  "who should I open first",
  "pipeline by stage",
  "what's due today",
];

export function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = () => requestAnimationFrame(() => endRef.current?.scrollIntoView({ behavior: "smooth" }));

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy) return;

    setInput("");
    setBusy(true);
    setTurns((t) => [...t, { role: "user", text }, { role: "engine", text: "", awaitingRows: true }]);
    scrollToEnd();

    const engineIndex = turns.length + 1;
    const patch = (fn: (turn: Turn) => Turn) =>
      setTurns((t) => t.map((turn, i) => (i === engineIndex ? fn(turn) : turn)));

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });

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

          if (event === "delta") {
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
              void runAddIntent(data.action).then((line) =>
                patch((turn) => ({ ...turn, text: line })),
              );
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
      patch((turn) => ({ ...turn, error: "The engine could not answer that.", awaitingRows: false }));
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }

  /** `add Emaar for Hire at 300K` — a direct action, not a chat answer. */
  async function runAddIntent(action: { company: string; solution?: string; value?: number }): Promise<string> {
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
      const summary = `${result.practice} · ${result.tower} · ${result.partner} · $${Math.round(result.value / 1000)}K · Tagged`;
      toast.success(`${result.account} added`, { description: summary });
      return `Added ${result.account} — ${summary}.`;
    }
    toast.error(result.message);
    return result.message;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-3xl">
          {turns.length === 0 && <EmptyState onPick={send} />}

          <AnimatePresence initial={false}>
            {turns.map((turn, i) =>
              turn.role === "user" ? (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6 flex justify-end">
                  <p className="max-w-[80%] rounded bg-panel px-3 py-2 text-[13px] text-body">{turn.text}</p>
                </motion.div>
              ) : (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8">
                  {/* §9.5 — the cyan hairline marks this block as engine-authored. */}
                  <div className="engine-mark">
                    {/* Progress is the engine working, not its answer. It is
                        replaced the moment real text arrives. */}
                    {!turn.text && turn.progress && (
                      <p className="flex items-center gap-2 text-[13px] text-faint">
                        <span className="size-1.5 animate-pulse rounded-full bg-cyan" />
                        {turn.progress}
                      </p>
                    )}
                    {turn.text && (
                      <p className="prose-chat whitespace-pre-wrap text-body">{turn.text}</p>
                    )}
                    {!turn.text && !turn.progress && !turn.error && (
                      <p className="text-[13px] text-faint">…</p>
                    )}
                    {turn.chart && <EngineChartBlock chart={turn.chart} />}
                    {turn.awaitingRows && turn.text && <RowSkeleton />}
                    {turn.rows && turn.rows.length > 0 && <ActionTable rows={turn.rows} />}
                    {turn.error && <p className="mt-2 text-[13px] text-amber">{turn.error}</p>}
                  </div>
                </motion.div>
              ),
            )}
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
            placeholder="Ask the engine, or type: add Emaar for Hire at 300K"
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
