import Link from "next/link";

/** Unknown account ids and mistyped paths, in the studio's own voice. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6">
      <h1 className="font-display text-xl tracking-tight text-body">That page does not exist</h1>
      <p className="prose-chat mt-2 text-muted">
        The link may be stale, or the account may have been removed.
      </p>
      <Link
        href="/chat"
        className="mt-5 self-start rounded bg-accent px-3 py-2 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
      >
        Back to Chat
      </Link>
    </main>
  );
}
