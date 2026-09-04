"use client";

import { toast } from "sonner";

/**
 * Starts a sweep from the browser, and tells the truth about what happened.
 *
 * Both callers — the chat "run the sweep again" intent and the ⌘K palette — used
 * to check only `response.ok`. When the session had expired the route redirected,
 * `fetch` followed it, and a 200 carrying the sign-in page's HTML looked like
 * success: the operator was told "Sweep started" when nothing had started.
 *
 * Lives here so the two callers cannot drift apart, which is exactly how the DNC
 * rule ended up implemented twice and differently.
 */
export async function runSweep(): Promise<string> {
  try {
    const response = await fetch("/api/sweeps/run", { method: "POST" });

    if (response.status === 401) {
      toast.error("Your session has ended");
      return "Your session has ended. Sign in again to run the sweep.";
    }

    // A 200 that is not JSON means a redirect was followed to an HTML page.
    const isJson = response.headers.get("content-type")?.includes("application/json");
    if (!response.ok || !isJson) {
      toast.error("Could not start the sweep");
      return "Could not start the sweep. Try again in a moment.";
    }

    const body = (await response.json()) as { message?: string };
    toast.success("Sweep started");
    return body.message ?? "Sweep started. Findings will land as they are found.";
  } catch {
    toast.error("Could not start the sweep");
    return "Could not start the sweep. Try again in a moment.";
  }
}
