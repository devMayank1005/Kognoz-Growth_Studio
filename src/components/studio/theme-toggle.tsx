"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

/**
 * Light / Late shift / System (PRD §9.8).
 *
 * The chosen theme is applied by a BLOCKING script in the document head (see
 * src/app/layout.tsx), before React hydrates. Setting `data-theme` from an
 * effect instead produces a hydration mismatch — verified in this codebase, not
 * assumed — because the server renders without the attribute and the client
 * adds it.
 *
 * This component therefore only writes the preference and applies it to the
 * live document; the script is what makes it survive a reload.
 */

type Theme = "light" | "dark" | "system";
const KEY = "gs-theme";

function apply(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private browsing, or storage blocked. The toggle still works for this
    // session; it just will not be remembered.
  }
}

/** Re-reads whenever anything changes `data-theme` on <html>. */
function subscribeToTheme(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function readTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" || attr === "dark" ? attr : "system";
}

/** Used for SSR and for the hydrating render, so the two always agree. */
function readServerTheme(): Theme {
  return "system";
}

export function ThemeToggle({ variant = "row" }: { variant?: "row" | "stack" | "icons" }) {
  /**
   * Read through useSyncExternalStore, not state.
   *
   * This component is server-rendered. A lazy `useState` initialiser returned
   * "system" on the server (no document) and the real theme in the browser —
   * where the blocking head script has already set `data-theme` — and React 19
   * treats that difference as a hydration mismatch, regenerates the tree, and
   * clears every attribute on <html>, throwing away the saved theme.
   *
   * `getServerSnapshot` is what React also uses for the hydrating render, so
   * both sides agree and the real value arrives immediately after. As a bonus
   * the MutationObserver keeps every copy of this control in sync: change the
   * theme in Settings and the one in the status line updates itself.
   */
  const theme = useSyncExternalStore(subscribeToTheme, readTheme, readServerTheme);

  const options: Array<{ value: Theme; label: string; Icon: typeof Sun }> = [
    { value: "light", label: "Briefing Room", Icon: Sun },
    { value: "dark", label: "Late shift", Icon: Moon },
    { value: "system", label: "Match system", Icon: Monitor },
  ];

  // The status line is a 28px strip, so there it is three icon buttons with the
  // full labels kept as accessible names and tooltips.
  if (variant === "icons") {
    return (
      <div className="flex items-center gap-0.5" role="group" aria-label="Appearance">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={theme === o.value}
            aria-label={o.label}
            title={o.label}
            onClick={() => apply(o.value)}
            className={`rounded p-1 transition-colors duration-150 ${
              theme === o.value ? "text-cyan" : "text-faint hover:text-body"
            }`}
          >
            <o.Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
          </button>
        ))}
      </div>
    );
  }

  // Three buttons side by side do not fit the 256px account menu, so there they
  // stack full-width instead. Same control, same behaviour.
  const stacked = variant === "stack";

  return (
    <div className={stacked ? "flex flex-col gap-1" : "flex gap-1.5"}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={theme === o.value}
          onClick={() => apply(o.value)}
          className={`rounded border text-[13px] transition-colors duration-150 ${
            stacked ? "w-full px-2 py-1 text-left" : "px-2.5 py-1"
          } ${theme === o.value ? "border-cyan text-body" : "border-line text-muted hover:text-body"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
