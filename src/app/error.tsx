"use client";

/**
 * Catches throws from any layout below the root — including
 * `(studio)/layout.tsx`, which is where `requireSession()` runs.
 *
 * This level is necessary, not redundant: `(studio)/error.tsx` lives INSIDE the
 * studio layout, so it cannot catch that layout's own failure. Verified by
 * pointing the app at an unreachable database — the studio boundary never
 * rendered and the operator got a blank 500. The studio boundary still handles
 * page-level failures with the chrome intact; this one handles the case where
 * the chrome itself could not be built.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const database = /timeout|ETIMEDOUT|ECONNRESET|ECONNREFUSED|connection|terminat|Failed query|session/i.test(
    error.message,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <h1 className="font-display text-xl tracking-tight text-body">
        {database ? "The database did not answer" : "Growth Studio hit an error"}
      </h1>
      <p className="prose-chat mt-2 text-muted">
        {database
          ? "You are still signed in — this is the connection being slow, not your session expiring. Nothing was lost. Try again."
          : "Something failed while building the page. Try again; if it persists the server needs looking at."}
      </p>

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded bg-accent px-3 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
        >
          Try again
        </button>
        <a
          href="/today"
          className="rounded border border-line px-3 py-2 text-[13px] text-body transition-colors duration-150 hover:bg-panel"
        >
          Go to Today
        </a>
      </div>

      {error.digest && <p className="mt-6 text-[11px] text-faint">Reference {error.digest}</p>}
    </main>
  );
}
