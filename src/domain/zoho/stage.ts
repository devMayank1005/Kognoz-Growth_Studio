/**
 * The stage picklist contract with Zoho (PRD §3, §6).
 *
 * Local stages are frozen strings precisely because they are this contract —
 * the decision log records "storage stage values unchanged for Zoho mapping".
 */

import type { Stage } from "../routing";

export const ZOHO_DEAL_STAGES = [
  "Qualification",
  "Needs Analysis",
  "Value Proposition",
  "Proposal/Price Quote",
  "Closed Won",
  "Closed Lost",
] as const;
export type ZohoDealStage = (typeof ZOHO_DEAL_STAGES)[number];

/** Verbatim from the reference prototype (docs/konverz-sales-copilot.jsx:518). */
export const ZOHO_STAGE: Record<Stage, ZohoDealStage> = {
  "Prospect": "Qualification",
  "Plan reach-out": "Qualification",
  "Reached out": "Qualification",
  "In conversation": "Needs Analysis",
  "Meeting set": "Value Proposition",
  "Proposal": "Proposal/Price Quote",
  "Won": "Closed Won",
  "Lost": "Closed Lost",
};

/**
 * The reverse is LOSSY — three local stages all push as "Qualification" — so it
 * is deliberately not a mirror.
 *
 * It never returns `Prospect` or `Plan reach-out`: a record that exists as a
 * Deal in Zoho is past Prospect by construction, and demoting a card back to
 * Prospect would strand the `zohoDealId` that proves it was converted.
 */
const REVERSE: Record<ZohoDealStage, Stage> = {
  "Qualification": "Reached out",
  "Needs Analysis": "In conversation",
  "Value Proposition": "Meeting set",
  "Proposal/Price Quote": "Proposal",
  "Closed Won": "Won",
  "Closed Lost": "Lost",
};

export function zohoStageFor(stage: Stage): ZohoDealStage {
  return ZOHO_STAGE[stage];
}

export function isZohoDealStage(v: string): v is ZohoDealStage {
  return (ZOHO_DEAL_STAGES as readonly string[]).includes(v);
}

/**
 * The stage a pull should apply, or null for "the remote tells us nothing new".
 *
 * The lossy reverse creates a trap: `Plan reach-out` and `Reached out` both
 * push as "Qualification", so a naive reverse lookup would drag every
 * `Plan reach-out` card forward to `Reached out` on the first reconcile, for
 * every card, forever. Asking the FORWARD map first is what prevents that — if
 * the remote stage is what we would have pushed, there is no divergence.
 *
 * A customised picklist value we do not know returns null rather than guessing.
 */
export function stageFromZoho(remote: string, localStage: Stage): Stage | null {
  if (!isZohoDealStage(remote)) return null;
  if (ZOHO_STAGE[localStage] === remote) return null;
  return REVERSE[remote];
}
