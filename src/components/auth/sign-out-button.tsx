"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/cn";

/**
 * Ends the session and returns to the sign-in screen.
 *
 * `signOut` takes `fetchOptions.onSuccess` rather than the `callbackURL` that
 * `signIn.social` uses, so this cannot mirror SignInButton exactly. The
 * `refresh()` matters: without it the router cache would keep serving the
 * signed-in RSC payload for pages already visited, so the studio would flash
 * back before proxy.ts bounced it.
 */
export function SignOutButton({ className, label = "Sign out" }: { className?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signOut({
              fetchOptions: {
                onSuccess: () => {
                  router.replace("/sign-in");
                  router.refresh();
                },
              },
            });
          } catch {
            setError("Could not sign out. Try again.");
            setBusy(false);
          }
        }}
        className={cn(
          "rounded border border-line px-2.5 py-1.5 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-60",
          className,
        )}
      >
        {busy ? "Signing out…" : label}
      </button>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}
