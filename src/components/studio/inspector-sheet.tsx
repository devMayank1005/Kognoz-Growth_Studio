"use client";

import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useEffect } from "react";

import { useSelection } from "@/store/selection";

import { InspectorPanel } from "./inspector-panel";

/**
 * §9.4 — below 1280px the inspector is not a pane, so the same content arrives
 * as a bottom sheet. Without this, selecting a card on a phone appears to do
 * nothing: the panel exists but is hidden by `xl:block`.
 *
 * Driven entirely by the existing selection store — selecting opens it,
 * dismissing clears the selection. No second source of truth.
 */
export function InspectorSheet() {
  const card = useSelection((s) => s.card);
  const select = useSelection((s) => s.select);
  const open = Boolean(card);

  // Escape closes it, as it would any dialog (§9.8 keyboard coverage).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, select]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // xl:hidden — above 1280 the real pane is showing and this would be
          // a duplicate.
          className="fixed inset-0 z-40 flex flex-col justify-end xl:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            aria-label="Close inspector"
            onClick={() => select(null)}
            className="absolute inset-0 bg-ink/40"
          />

          <motion.div
            role="dialog"
            aria-label="Card detail"
            initial={{ y: 24 }}
            animate={{ y: 0 }}
            exit={{ y: 24 }}
            className="relative max-h-[85dvh] overflow-y-auto rounded-t-lg border-t border-line bg-panel p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <button
              type="button"
              onClick={() => select(null)}
              aria-label="Close"
              className="absolute right-3 top-3 rounded p-1 text-muted hover:bg-surface hover:text-body"
            >
              <X aria-hidden className="size-4" />
            </button>
            <InspectorPanel />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
