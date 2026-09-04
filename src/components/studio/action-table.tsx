"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { toast } from "sonner";

import { addCard } from "@/app/actions/add-card";
import { generateDraft } from "@/app/actions/card-actions";
import type { EngineRow } from "@/engine/schemas";
import { cn } from "@/lib/cn";

/**
 * §9.9 — the action table. Every row carries exactly one button: ＋ Add.
 *
 * Adding is optimistic in feel (the row marks itself immediately) but the
 * server is the authority: a DNC block or a duplicate comes back as a refusal
 * and the row resets, with the reason stated plainly rather than swallowed.
 */

const fmtValue = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

type RowState = "idle" | "adding" | "added" | "blocked";

export function ActionTable({ rows, onAdded }: { rows: EngineRow[]; onAdded?: () => void }) {
  const [state, setState] = useState<Record<number, RowState>>({});
  const [added, setAdded] = useState<Record<number, string>>({});
  const [drafting, setDrafting] = useState<number | null>(null);

  if (rows.length === 0) return null;

  const add = async (row: EngineRow, index: number) => {
    setState((s) => ({ ...s, [index]: "adding" }));
    try {
      const result = await addCard(row);
      if (result.ok) {
        setState((s) => ({ ...s, [index]: "added" }));
        // Keep the id: the next thing an operator wants is the first note,
        // and without it they had to leave chat and hunt for the row.
        setAdded((a) => ({ ...a, [index]: result.id }));
        toast.success(`${result.account} added`, {
          description: `${result.practice} · ${result.tower} · ${result.partner} · ${fmtValue(result.value)}`,
        });
        onAdded?.();
      } else {
        setState((s) => ({ ...s, [index]: result.reason === "dnc" ? "blocked" : "idle" }));
        toast.error(result.message);
      }
    } catch {
      setState((s) => ({ ...s, [index]: "idle" }));
      toast.error("Could not add that row.");
    }
  };

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-faint">
            <th scope="col" className="h-row px-2 font-medium">Solution</th>
            <th scope="col" className="h-row px-2 font-medium">Company</th>
            <th scope="col" className="h-row px-2 font-medium">Contact</th>
            <th scope="col" className="h-row px-2 font-medium">Trigger</th>
            <th scope="col" className="h-row px-2 text-right font-medium">Value</th>
            <th scope="col" className="h-row px-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const s = state[i] ?? "idle";
            return (
              <motion.tr
                key={`${row.company}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="border-b border-line last:border-0 align-top"
              >
                <td className="h-row px-2 py-1.5 text-muted">{row.solution}</td>
                <td className="h-row px-2 py-1.5 font-medium text-body">{row.company}</td>
                <td className="h-row px-2 py-1.5 text-muted">
                  {row.contact_name ? (
                    <span>
                      {row.contact_name}
                      {row.contact_title && <span className="text-faint"> ({row.contact_title})</span>}
                    </span>
                  ) : (
                    // §9.5 — an unknown person is named as a role to identify,
                    // never guessed at.
                    <span className="text-faint">{row.contact_title || "to identify"}</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-muted">
                  <span className="line-clamp-2">{row.trigger}</span>
                  {row.url && (
                    <a
                      href={row.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-[11px] text-accent underline underline-offset-2"
                    >
                      source
                    </a>
                  )}
                </td>
                <td className="num h-row px-2 py-1.5 text-right text-body">{fmtValue(row.value)}</td>
                <td className="h-row px-2 py-1.5 text-right">
                  <button
                    type="button"
                    disabled={s !== "idle"}
                    onClick={() => add(row, i)}
                    className={cn(
                      "rounded px-2 py-1 text-[13px] font-medium transition-colors duration-150",
                      s === "added" && "text-won-text",
                      s === "blocked" && "text-danger",
                      s === "idle" && "bg-accent text-white hover:opacity-90",
                      s === "adding" && "bg-accent/60 text-white",
                    )}
                  >
                    {s === "added" ? "✓ Added" : s === "blocked" ? "Blocked" : s === "adding" ? "Adding…" : "＋ Add"}
                  </button>
                  {added[i] && (
                    <button
                      type="button"
                      disabled={drafting === i}
                      onClick={async () => {
                        setDrafting(i);
                        try {
                          const d = await generateDraft(added[i]);
                          if (!d.ok) return toast.error(d.message);
                          toast.success(`Draft ready for ${row.company}`, {
                            description: d.subject,
                            action: { label: "Open in mail", onClick: () => window.open(d.mailto) },
                          });
                        } catch {
                          toast.error("Could not write the draft");
                        } finally {
                          setDrafting(null);
                        }
                      }}
                      className="ml-1 rounded px-2 py-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:bg-panel disabled:opacity-40"
                    >
                      {drafting === i ? "…" : "✓ Draft"}
                    </button>
                  )}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
