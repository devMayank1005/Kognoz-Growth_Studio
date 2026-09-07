"use client";

import { useState } from "react";
import { toast } from "sonner";

import { addCard } from "@/app/actions/add-card";
import { dispatchPacket } from "@/app/actions/card-actions";
import type { PipelineCardRow } from "@/db/queries";
import { viewMoney, type MoneyView } from "@/domain/money";
import { practiceForTarget } from "@/domain/practices";
import type { Target } from "@/domain/scoring";
import { useSelection, useWorkspace } from "@/store/selection";

/**
 * The rows on Today, with working actions.
 *
 * Every button here used to be decorative: the page was a server component and
 * `Row` took `action` as a plain string label with no handler at all, so Open,
 * Nudge and ＋ Add did nothing. This is the smallest client boundary that makes
 * them real — the lists, counts and empty states stay on the server.
 */

const shell =
  "flex items-center gap-3 border-b border-line py-2 last:border-0";
const actionButton =
  "shrink-0 rounded px-2 py-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:bg-panel disabled:opacity-40";

function Meta({ text, tone }: { text?: string; tone?: "amber" }) {
  if (!text) return null;
  return (
    <span className={`text-[11px] ${tone === "amber" ? "text-amber" : "text-faint"}`}>{text}</span>
  );
}

/** Due now — opens the card in the inspector. */
export function DueRow({
  card,
  meta,
  tone,
}: {
  card: PipelineCardRow;
  meta?: string;
  tone?: "amber";
}) {
  const select = useSelection((s) => s.select);
  const inspectorOpen = useWorkspace((s) => s.inspectorOpen);
  const toggleInspector = useWorkspace((s) => s.toggleInspector);

  return (
    <li className={shell}>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-body">{card.account}</span>
        <span className="ml-2 text-[13px] text-muted">
          {card.next || "move it"} · {card.partner}
        </span>
      </div>
      <Meta text={meta} tone={tone} />
      <button
        type="button"
        className={actionButton}
        onClick={() => {
          select(card);
          // Opening a card with the pane collapsed would look like nothing
          // happened.
          if (!inspectorOpen) toggleInspector();
        }}
      >
        Open
      </button>
    </li>
  );
}

/** With partners too long — re-sends the packet and restarts the clock. */
export function NudgeRow({ card, meta }: { card: PipelineCardRow; meta?: string }) {
  const [busy, setBusy] = useState(false);

  return (
    <li className={shell}>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-body">{card.account}</span>
        <span className="ml-2 text-[13px] text-muted">{card.partner}</span>
      </div>
      <Meta text={meta} tone="amber" />
      <button
        type="button"
        disabled={busy}
        className={actionButton}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await dispatchPacket(card.id);
            if (!r.ok) return toast.error(r.message);
            try {
              await navigator.clipboard.writeText(r.text);
              toast.success(`Packet copied again — paste to ${card.partner}.`);
            } catch {
              toast.success("Packet ready", { description: "Clipboard blocked; open the card to copy." });
            }
          } catch {
            toast.error("That did not go through", {
              description: "The server did not answer. Nothing was changed — try again.",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "…" : "Nudge"}
      </button>
    </li>
  );
}

/** AMS windows opening — adds the target as a routed card. */
export function AmsRow({ target, meta, money }: { target: Target; meta?: string; money: MoneyView }) {
  const [state, setState] = useState<"idle" | "busy" | "added">("idle");
  const practice = practiceForTarget(target);

  return (
    <li className={shell}>
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-body">{target.name}</span>
        <span className="ml-2 text-[13px] text-muted">
          {practice?.name ?? "AI-Led HR Transformation"} · {target.country}
        </span>
      </div>
      <Meta text={meta} />
      <button
        type="button"
        disabled={state !== "idle"}
        className={actionButton}
        onClick={async () => {
          setState("busy");
          try {
            const r = await addCard({
              solution: practice?.name ?? "AI-Led HR Transformation",
              company: target.name,
              contact_name: "",
              contact_title: practice?.buyer ?? "CHRO",
              country: target.country,
              industry: target.industry,
              trigger: target.evidence,
              signal: target.signal,
              url: target.url,
            });
            if (!r.ok) {
              setState("idle");
              return toast.error(r.message);
            }
            setState("added");
            toast.success(`${r.account} added`, {
              description: `${r.practice} · ${r.tower} · ${r.partner} · ${viewMoney(r.value, money)}`,
            });
          } catch {
            setState("idle");
            toast.error("That did not go through", {
              description: "The server did not answer. Nothing was added — try again.",
            });
          }
        }}
      >
        {state === "busy" ? "…" : state === "added" ? "✓ Added" : "＋ Add"}
      </button>
    </li>
  );
}
