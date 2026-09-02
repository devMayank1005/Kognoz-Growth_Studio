"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { signIn } from "@/lib/auth-client";

export function SignInButton() {
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only ever trust an in-app path here — an absolute URL from the query string
  // would make this an open redirect.
  const next = params.get("next");
  const callbackURL = next?.startsWith("/") && !next.startsWith("//") ? next : "/chat";

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signIn.social({ provider: "microsoft", callbackURL });
          } catch {
            setError("Could not reach Microsoft. Try again.");
            setBusy(false);
          }
        }}
        className="flex w-full items-center justify-center gap-2 rounded border border-line bg-surface px-3 py-2 text-[13px] font-medium text-body transition-colors duration-150 hover:bg-panel disabled:opacity-60"
      >
        <MicrosoftMark />
        {busy ? "Opening Microsoft…" : "Continue with Microsoft"}
      </button>
      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function MicrosoftMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4">
      <rect x="0" y="0" width="7" height="7" fill="#F25022" />
      <rect x="9" y="0" width="7" height="7" fill="#7FBA00" />
      <rect x="0" y="9" width="7" height="7" fill="#00A4EF" />
      <rect x="9" y="9" width="7" height="7" fill="#FFB900" />
    </svg>
  );
}
