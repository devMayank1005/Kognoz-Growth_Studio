"use client";

import { useEffect, useRef, useCallback } from "react";

import type { PipelineCardRow } from "@/db/queries";
import { practiceById } from "@/domain/practices";
import { syncStatusOf, type SyncStatus } from "@/domain/zoho/status";
import { viewMoney, type MoneyView } from "@/domain/money";
import { useSelection, useWorkspace } from "@/store/selection";
import { cn } from "@/lib/cn";

/**
 * §9.9 — Pipeline. 32px rows, sticky header, right-aligned numerals, and
 * keyboard navigation (↑ ↓ to move, Enter to select).
 *
 * A row added in the last few seconds gets the single 2-second green pulse
 * from §9.6 — once, never repeated.
 */

const STAGE_WORD: Record<string, string> = {
  "Prospect": "Prospect",
  "Plan reach-out": "Tagged",
  "Reached out": "Contacted",
  "In conversation": "Talking",
  "Meeting set": "Meeting",
  "Proposal": "Proposal",
  "Won": "Won",
  "Lost": "Closed",
};


export function PipelineTable({
  cards,
  highlightId,
  onSelect,
  zohoConnected = false,
  money,
}: {
  cards: PipelineCardRow[];
  highlightId?: string;
  onSelect?: (card: PipelineCardRow) => void;
  /** False until the connection lands, so the column stops implying a sync. */
  zohoConnected?: boolean;
  money: MoneyView;
}) {
  const active = useWorkspace((s) => s.cursor);
  const setActive = useWorkspace((s) => s.setCursor);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const select = useSelection((s) => s.select);
  const selectedId = useSelection((s) => s.card?.id);
  const selectedCardId = useWorkspace((s) => s.selectedCardId);

  const choose = useCallback(
    (card: PipelineCardRow) => {
      select(card);
      onSelect?.(card);
    },
    [select, onSelect],
  );

  // Restore the row the operator had open before the refresh. Matched by id
  // against the freshly loaded list, so the inspector never shows stale values.
  useEffect(() => {
    if (!selectedCardId || selectedId) return;
    const card = cards.find((c) => c.id === selectedCardId);
    if (card) select(card);
  }, [selectedCardId, selectedId, cards, select]);

  // The handler is held in a ref so the listener is bound once. It used to
  // depend on [cards, active], which tore down and re-added a window listener
  // on every single arrow keypress.
  const latest = useRef({ cards, active, choose, setActive });
  useEffect(() => {
    latest.current = { cards, active, choose, setActive };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { cards, active, choose, setActive } = latest.current;
      if (!cards.length) return;

      // Only when the table has focus. This used to preventDefault on every
      // arrow key anywhere on the page, hijacking scrolling and caret movement
      // — including inside the board's stage <select>.
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (!bodyRef.current?.closest("table")?.contains(document.activeElement) && document.activeElement !== document.body) {
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive(Math.min(active + 1, cards.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive(Math.max(active - 1, 0));
      } else if (e.key === "Enter") {
        choose(cards[active]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (cards.length === 0) {
    return (
      <p className="prose-chat text-muted">
        No cards yet. Ask the engine what is moving in a market, then add a row.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-left">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-faint">
            <th scope="col" className="h-row px-2 font-medium">Company</th>
            <th scope="col" className="h-row px-2 font-medium">Solution</th>
            <th scope="col" className="h-row px-2 font-medium">Stage</th>
            <th scope="col" className="h-row px-2 text-right font-medium">Value</th>
            <th scope="col" className="h-row px-2 font-medium">Partner</th>
            <th scope="col" className="h-row px-2 font-medium">Contact</th>
            <th scope="col" className="h-row px-2 font-medium">Next</th>
            <th scope="col" className="h-row px-2 font-medium">Zoho</th>
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {cards.map((c, i) => (
            <tr
              key={c.id}
              onClick={() => {
                setActive(i);
                choose(c);
              }}
              aria-selected={i === active}
              className={cn(
                "cursor-pointer border-b border-line last:border-0",
                (i === active || c.id === selectedId) && "bg-panel",
                c.id === highlightId && "row-added",
              )}
            >
              <td className="h-row px-2 font-medium text-body">{c.account}</td>
              <td className="h-row px-2 text-muted">{practiceById(c.practiceId)?.name ?? c.practiceId}</td>
              <td className="h-row px-2">
                <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-muted">
                  {STAGE_WORD[c.stage] ?? c.stage}
                </span>
              </td>
              <td className="num h-row px-2 text-right text-body">{viewMoney(c.value, money)}</td>
              <td className="h-row px-2 text-muted">{c.partner}</td>
              <td className="h-row px-2 text-muted">
                {c.contact || <span className="text-faint">to identify</span>}
              </td>
              <td className="h-row px-2 text-muted">{c.next}</td>
              <td className="h-row px-2">
                <ZohoPill status={syncStatusOf(c, zohoConnected)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The per-card Zoho state (PRD §6).
 *
 * Five states, not two. The old two-state version read `zohoSyncedAt` alone, so
 * every row showed amber "pending" — including when Zoho was not connected at
 * all, which promised a sync that could not happen, and including cards that
 * had synced and were then edited, which it called synced.
 */
function ZohoPill({ status, error }: { status: SyncStatus; error?: string | null }) {
  switch (status) {
    case "off":
      return <span className="text-[11px] text-faint">—</span>;
    case "synced":
      return <span className="text-[11px] text-won-text">synced</span>;
    case "blocked":
      // §8: on the do-not-contact list. Not a failure to retry.
      return <span className="text-[11px] text-faint" title="On the do-not-contact list">blocked</span>;
    case "error":
      return (
        <span className="text-[11px] text-danger" title={error ?? "Zoho refused this record"}>
          failed
        </span>
      );
    default:
      return <span className="text-[11px] text-amber">pending</span>;
  }
}
