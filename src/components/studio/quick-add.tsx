"use client";

import { useState } from "react";
import { toast } from "sonner";

import { addCard } from "@/app/actions/add-card";
import { PRACTICES } from "@/domain/practices";

/**
 * Quick-add (PRD §9.9, §5).
 *
 * The pipeline had no way to create a card at all — every route in went through
 * chat or an engine action table, so a door someone heard about on a call could
 * not be captured where the operator was already looking. Straight to Tagged
 * ("Plan reach-out"), the same stage the typed `add …` intent uses.
 */
export function QuickAdd() {
  const [open, setOpen] = useState(false);
  const [company, setCompany] = useState("");
  const [solution, setSolution] = useState(PRACTICES[0]?.name ?? "");
  const [value, setValue] = useState("300");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel"
      >
        ＋ Add a card
      </button>
    );
  }

  async function submit() {
    const name = company.trim();
    if (!name) return toast.error("A company name is required.");

    setBusy(true);
    try {
      const r = await addCard(
        {
          company: name,
          solution,
          value: Number(value) * 1000 || undefined,
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

      if (!r.ok) return toast.error(r.message);

      toast.success(`${r.account} added`, {
        description: `${r.practice} · ${r.tower} · ${r.partner} · $${Math.round(r.value / 1000)}K · Tagged`,
      });
      setCompany("");
      setOpen(false);
    } catch {
      toast.error("Could not add that card", {
        description: "The server did not answer. Nothing was added — try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Company"
        aria-label="Company"
        className="w-40 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body placeholder:text-faint"
      />
      <select
        value={solution}
        onChange={(e) => setSolution(e.target.value)}
        aria-label="Solution"
        className="rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
      >
        {PRACTICES.map((p) => (
          <option key={p.id} value={p.name}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="text-[13px] text-faint">$</span>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => setValue(e.target.value.replace(/[^0-9]/g, ""))}
        aria-label="Value in thousands"
        className="num w-16 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
      />
      <span className="text-[13px] text-faint">K</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded bg-accent px-2.5 py-1 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="px-1 text-[11px] text-faint hover:text-body"
      >
        cancel
      </button>
    </div>
  );
}
