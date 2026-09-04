"use client";

import { useState } from "react";
import { toast } from "sonner";

import { dismissSignal } from "@/app/actions/card-actions";

/**
 * Retires a signal that is not real.
 *
 * `signals.dismissedAt` had three readers and no writer, so a wrong radar find
 * kept ranking in the brief, the Today list and the account counts forever.
 */
export function DismissSignal({ signalId, label }: { signalId: string; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  if (state === "done") return <span className="text-[11px] text-faint">dismissed</span>;

  return (
    <button
      type="button"
      disabled={state === "busy"}
      title={`Dismiss ${label} — it stops ranking`}
      onClick={async () => {
        setState("busy");
        try {
          const r = await dismissSignal(signalId);
          if (!r.ok) {
            setState("idle");
            return toast.error(r.message);
          }
          setState("done");
          toast.success("Signal dismissed", { description: "It will stop ranking." });
        } catch {
          setState("idle");
          toast.error("Could not dismiss that signal");
        }
      }}
      className="text-[11px] text-faint transition-colors hover:text-danger disabled:opacity-40"
    >
      {state === "busy" ? "…" : "dismiss"}
    </button>
  );
}
