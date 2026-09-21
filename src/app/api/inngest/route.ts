import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

/**
 * Declared, not left to the platform default.
 *
 * Every `step.run` is its own HTTP POST to this route, so this limit applies to
 * ONE step — not to `daily-sweep` end to end. That is what makes the sweeps
 * survivable at all: eleven Opus calls could never share a single invocation.
 * But one sweep step is still an Opus call with five web searches and, on
 * failure, up to two more (`src/engine/sweeps.ts`), and the default is not a
 * number this project should silently inherit — it has changed before, and a
 * killed invocation does not report an error, it fails the step.
 *
 * 300 is the Hobby ceiling (CLAUDE.md "Git" records the plan). `BUDGET_MS` in
 * src/engine/sweeps.ts is deliberately set below this so a sweep stops and
 * reports rather than being killed mid-flight. Raise both together, never one.
 */
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({ client: inngest, functions });
