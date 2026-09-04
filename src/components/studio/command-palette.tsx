"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV } from "./shell";
import { runSweep } from "@/lib/run-sweep";

/**
 * ⌘K (PRD §9.9).
 *
 * §9.9 says the composer opens on ⌘K too, so "Ask the engine…" leads and a
 * typed question is handed straight to Chat rather than making the operator
 * navigate first and retype.
 */
export function CommandPalette({
  accounts,
  defaultOpen = false,
}: {
  accounts: Array<{ id: string; name: string }>;
  /** True when the mount wrapper armed us on the operator's first ⌘K. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    router.push(href);
  };

  const ask = () => {
    const q = query.trim();
    if (!q) return go("/chat");
    // Chat reads this and prefills the composer.
    go(`/chat?q=${encodeURIComponent(q)}`);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
    >
      <button type="button" aria-hidden tabIndex={-1} className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />

      <div className="relative w-[min(36rem,92vw)] overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Ask the engine, or jump to…"
          className="w-full border-b border-line bg-transparent px-3 py-2.5 text-[13px] text-body outline-none placeholder:text-faint"
        />

        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="px-2 py-3 text-[13px] text-faint">
            Nothing matches. Press enter to ask the engine instead.
          </Command.Empty>

          {query.trim() && (
            <Command.Group heading="Ask" className="text-[11px] uppercase tracking-wide text-faint">
              <Item onSelect={ask}>
                Ask the engine — <span className="text-muted">&ldquo;{query.trim()}&rdquo;</span>
              </Item>
            </Command.Group>
          )}

          <Command.Group heading="Go to" className="text-[11px] uppercase tracking-wide text-faint">
            {NAV.map(({ href, label }) => (
              <Item key={href} onSelect={() => go(href)}>{label}</Item>
            ))}
          </Command.Group>

          {accounts.length > 0 && (
            <Command.Group heading="Accounts" className="text-[11px] uppercase tracking-wide text-faint">
              {accounts.slice(0, 200).map((a) => (
                <Item key={a.id} onSelect={() => go(`/accounts/${a.id}`)}>{a.name}</Item>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Engine" className="text-[11px] uppercase tracking-wide text-faint">
            <Item
              onSelect={async () => {
                setOpen(false);
                await runSweep();
              }}
            >
              Run the sweep again
            </Item>
          </Command.Group>
        </Command.List>
      </div>
    </Command.Dialog>
  );
}

function Item({ onSelect, children }: { onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-2 py-1.5 text-[13px] text-body data-[selected=true]:bg-panel"
    >
      {children}
    </Command.Item>
  );
}
