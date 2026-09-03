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
