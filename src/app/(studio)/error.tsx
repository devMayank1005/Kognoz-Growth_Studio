"use client";

/**
 * The boundary that matters.
 *
 * It sits INSIDE the studio layout, so when a page throws the rail, top bar and
 * status line survive and the operator still has somewhere to go. Without it,
 * Next fell through to its unstyled global fallback — a bare "Application error"
 * page with no chrome and no way back except editing the URL — and because
 * `requireSession()` runs in the layout above every page, the whole studio
 * vanished.
 *
 * The most common cause here is the database being unreachable from India, which
 * is a retry, not a bug. So `reset()` is the primary action and the copy says so
 * instead of showing a stack trace.
 *
 * This does NOT catch a dropped pooled socket — that fires outside React's
 * render tree entirely. `pool.on("error")` in src/db/client.ts handles that.
 */
export default function StudioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const slow = /timeout|ETIMEDOUT|ECONNRESET|connection|terminat/i.test(error.message);

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-xl tracking-tight text-body">
        {slow ? "The database did not answer" : "Something went wrong on this screen"}
      </h1>
      <p className="prose-chat mt-2 text-muted">
        {slow
          ? "That is usually the connection being slow rather than anything being broken. Nothing you did was lost — try again."
          : "The rest of the studio is still working. Try this screen again, or move to another section from the rail."}
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
          href="/chat"
          className="rounded border border-line px-3 py-2 text-[13px] text-body transition-colors duration-150 hover:bg-panel"
        >
          Go to Chat
        </a>
      </div>

      {/* The digest is what ties this to a server log line. No stack, no message. */}
      {error.digest && (
        <p className="mt-6 text-[11px] text-faint">Reference {error.digest}</p>
      )}
    </div>
  );
}
