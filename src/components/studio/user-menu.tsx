"use client";

import { useEffect, useRef, useState } from "react";

import { SignOutButton } from "@/components/auth/sign-out-button";

export interface StudioUser {
  name: string;
  email: string;
  orgName: string;
}

/**
 * Who is signed in, and the way out.
 *
 * Until now nothing in the chrome said whose workspace this was — the session
 * never left the server — and there was no way to sign out at all.
 *
 * Hand-rolled rather than pulled from a component library because the app has
 * none: no radix, no shadcn primitives, everything here is built directly.
 */
export function UserMenu({ user }: { user: StudioUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account — ${user.name}`}
        className="flex items-center gap-2 rounded p-1 pr-2 text-muted transition-colors duration-150 hover:bg-panel hover:text-body"
      >
        <span
          aria-hidden
          className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium text-white"
        >
          {initials(user.name, user.email)}
        </span>
        <span className="hidden max-w-28 truncate text-[13px] lg:block">{user.name}</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded border border-line bg-surface p-3 shadow-lg"
        >
          <p className="truncate text-[13px] font-medium text-body">{user.name}</p>
          <p className="truncate text-[11px] text-faint">{user.email}</p>
          <p className="mt-2 truncate text-[11px] text-muted">{user.orgName}</p>
          <div className="mt-3 border-t border-line pt-3">
            <SignOutButton className="w-full" />
          </div>
        </div>
      )}
    </div>
  );
}

/** Two letters from the name, falling back to the address. */
function initials(name: string, email: string): string {
  const source = name.trim() || email.trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
