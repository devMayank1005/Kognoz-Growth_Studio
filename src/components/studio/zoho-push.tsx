"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

/**
 * "Push now" — one implementation, two places.
 *
 * Both controls that offer a push previously did nothing. The inspector button
 * had no `onClick` at all, and the top-bar chip was permanently disabled with
 * `title="Zoho is not connected yet"` — a sentence that cannot be true, because
 * `pendingCount` already returns 0 when the connection is missing, so the chip
 * only ever renders when Zoho *is* connected. Two dead controls, one of which
 * lied about why.
 *
 * The work itself is queued, not done inline: the route sends an Inngest event
 * and returns. A push of six cards is six Zoho round trips from India, which is
 * far past what a request should hold open.
 */
export function useZohoPush(pending: number) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function push() {
    if (busy || pending === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/zoho/push", { method: "POST" });
      if (res.status === 401) {
        toast.error("Your session has ended", { description: "Sign in again to push." });
        return;
      }

      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; message?: string; dryRun?: boolean }
        | null;
      if (!body?.ok) {
        toast.error(body?.message ?? "Could not start the push");
        return;
      }

      const cards = `${pending} card${pending === 1 ? "" : "s"}`;
      toast.success(body.message ?? "Pushing to Zoho", {
        // Queued, not landed — and in dry run, not even queued to land. Saying
        // "the column updates as they land" while dry run is on would be the
        // same lie the dead button told, one step further along: the operator
        // clicks, sees success, and watches nothing change.
        description: body.dryRun
          ? `${cards} checked. The payloads are in the server log — turn dry run off in Settings to write them.`
          : `${cards} queued. The Zoho column updates as they land.`,
      });
      // Nothing to re-read when nothing was written.
      if (!body.dryRun) setTimeout(() => router.refresh(), 4000);
    } catch {
      toast.error("Could not reach the server", { description: "Nothing was pushed — try again." });
    } finally {
      setBusy(false);
    }
  }

  return { busy, push };
}
