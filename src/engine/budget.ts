import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { modelCalls, settings } from "@/db/schema";
import { redactSecrets } from "@/lib/redact";

import type { UsageReport } from "./client";

/**
 * Per-org daily model-call budget (PRD §4.1, §11).
 *
 * "Soft, logged, not operator-facing" — so exceeding it is refused at the API
 * boundary with a clear reason, but the operator sees a plain message rather
 * than a stack trace, and every call is recorded either way for cost tracking.
 */

const DEFAULT_BUDGET = 60;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function callsUsedToday(orgId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(modelCalls)
    .where(and(eq(modelCalls.orgId, orgId), gte(modelCalls.at, startOfUtcDay(now))));
  return row?.n ?? 0;
}

export async function budgetFor(orgId: string): Promise<number> {
  const [row] = await db
    .select({ budget: settings.dailyCallBudget })
    .from(settings)
    .where(eq(settings.orgId, orgId));
  return row?.budget ?? DEFAULT_BUDGET;
}

export interface BudgetCheck {
  allowed: boolean;
  used: number;
  budget: number;
}

export async function checkBudget(orgId: string): Promise<BudgetCheck> {
  const [used, budget] = await Promise.all([callsUsedToday(orgId), budgetFor(orgId)]);
  return { allowed: used < budget, used, budget };
}

/**
 * Records a call for cost tracking and the budget guard. Never throws.
 *
 * The error is redacted before it is stored: an SDK failure can embed the API
 * key in its message, and this used to write it straight into the table.
 */
export async function logModelCall(input: {
  orgId: string;
  kind: string;
  model: string;
  speed?: string;
  usage?: UsageReport;
  latencyMs?: number;
  error?: string;
}): Promise<void> {
  try {
    await db.insert(modelCalls).values({
      orgId: input.orgId,
      kind: input.kind,
      model: input.model,
      speed: input.speed ?? "standard",
      inputTokens: input.usage?.inputTokens ?? 0,
      outputTokens: input.usage?.outputTokens ?? 0,
      cacheReadTokens: input.usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: input.usage?.cacheWriteTokens ?? 0,
      latencyMs: input.latencyMs,
      error: redactSecrets(input.error),
    });
  } catch (err) {
    // Telemetry must never take down the request it is measuring.
    console.error("[budget] failed to log model call", err);
  }
}
