"use client";

import { useEffect, useRef, useState } from "react";

import type { PipelineCardRow } from "@/db/queries";
import { practiceById } from "@/domain/practices";
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

const fmtValue = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

export function PipelineTable({
  cards,
  highlightId,
  onSelect,
}: {
  cards: PipelineCardRow[];
  highlightId?: string;
  onSelect?: (card: PipelineCardRow) => void;
}) {
  const [active, setActive] = useState(0);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cards.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, cards.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        onSelect?.(cards[active]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards, active, onSelect]);

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
                onSelect?.(c);
              }}
              aria-selected={i === active}
              className={cn(
                "cursor-pointer border-b border-line last:border-0",
                i === active && "bg-panel",
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
              <td className="num h-row px-2 text-right text-body">{fmtValue(c.value)}</td>
              <td className="h-row px-2 text-muted">{c.partner}</td>
              <td className="h-row px-2 text-muted">
                {c.contact || <span className="text-faint">to identify</span>}
              </td>
              <td className="h-row px-2 text-muted">{c.next}</td>
              <td className="h-row px-2">
                {c.zohoSyncedAt ? (
                  <span className="text-[11px] text-won-text">synced</span>
                ) : (
                  <span className="text-[11px] text-amber">pending</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
