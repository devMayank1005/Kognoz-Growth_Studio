"use client";

import { useState } from "react";

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

export function ThemeToggle() {
  // Read lazily during the first client render rather than in an effect, so
  // there is no flash and no cascading re-render.
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document === "undefined") return "system";
    const attr = document.documentElement.getAttribute("data-theme");
    return attr === "light" || attr === "dark" ? attr : "system";
  });

  const options: Array<{ value: Theme; label: string }> = [
    { value: "light", label: "Briefing Room" },
    { value: "dark", label: "Late shift" },
    { value: "system", label: "Match system" },
  ];

  return (
    <div className="flex gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={theme === o.value}
          onClick={() => {
            setTheme(o.value);
            apply(o.value);
          }}
          className={`rounded border px-2.5 py-1 text-[13px] transition-colors duration-150 ${
            theme === o.value ? "border-cyan text-body" : "border-line text-muted hover:text-body"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
