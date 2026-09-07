import { Inngest } from "inngest";
import { readSecret } from "@/lib/env";

// Passed explicitly rather than left to the SDK's own env lookup, so a
// multi-line paste cannot silently break event delivery — the sweeps are
// scheduled, so nobody would be watching when it did.
export const inngest = new Inngest({
  id: "growth-studio",
  eventKey: readSecret("INNGEST_EVENT_KEY"),
  signingKey: readSecret("INNGEST_SIGNING_KEY"),
});

export const SWEEP_EVENT = "growth-studio/sweeps.requested" as const;

/** A card was just created and should reach Zoho within seconds (§12 #6). */
export const ZOHO_CREATE_EVENT = "growth-studio/zoho.create.requested" as const;
/** A card changed. Debounced per card. */
export const ZOHO_PUSH_EVENT = "growth-studio/zoho.push.requested" as const;
/** "Push now" — everything pending, in one run. */
export const ZOHO_SYNC_ALL_EVENT = "growth-studio/zoho.sync-all.requested" as const;
