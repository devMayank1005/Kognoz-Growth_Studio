"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

/**
 * Loads the ⌘K palette the first time someone actually presses ⌘K.
 *
 * cmdk is 58 KB and the palette is closed on every route until asked for, so
 * mounting it eagerly put a library in the first load of every page for a panel
 * most visits never open. This listens for the shortcut itself, then hands the
 * real palette `defaultOpen` so the very first press still opens it — the
 * deferral is invisible to the operator.
 */
const CommandPalette = dynamic(() => import("./command-palette").then((m) => m.CommandPalette));

export function CommandPaletteMount({ accounts }: { accounts: Array<{ id: string; name: string }> }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (armed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setArmed(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [armed]);

  if (!armed) return null;
  return <CommandPalette accounts={accounts} defaultOpen />;
}
