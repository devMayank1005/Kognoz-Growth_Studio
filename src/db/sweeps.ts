import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { accounts, signals, sweepRuns } from "@/db/schema";
import { industryOf } from "@/domain/industry";
import type { CleanSweepItem } from "@/engine/sweep-schema";
import type { SweepOutcome } from "@/engine/sweeps";

/**
 * Persisting sweep findings (PRD §4.1).
 *
 * Companies the radar finds that we did not know are absorbed as `discovered`
 * with a `firstSeen` date — which is exactly what the already-tested
 * RADAR_GRACE_DAYS path in domain/scoring.ts expects, so a new find surfaces
 * for a fortnight even before it has a live signal.
 */

export interface PersistResult {
  sweepRunId: string;
  signalsWritten: number;
  accountsDiscovered: number;
}

export async function persistSweep(orgId: string, outcome: SweepOutcome): Promise<PersistResult> {
  /**
   * Both ends of the run, from data we already had.
   *
   * `startedAt` used to be the column's `defaultNow()` — the Postgres clock at
   * INSERT, which is when the sweep *finished*, not when it started. Combined
   * with a `finishedAt` captured in JS a few milliseconds earlier, every one of
   * the 57 rows written so far has `finished_at` BEFORE `started_at`, and the
   * duration of a sweep was unrecoverable. `latencyMs` was on the outcome the
   * whole time.
   */
  const finishedAt = new Date();
  const startedAt = new Date(finishedAt.getTime() - outcome.latencyMs);

  const [run] = await db
    .insert(sweepRuns)
    .values({
      orgId,
      kind: outcome.kind,
      market: outcome.market ?? outcome.title,
      itemsFound: outcome.items.length,
      startedAt,
      finishedAt,
      // A hard failure ONLY. These two used to share a column, so a sweep that
      // found six, kept four and refused two was reported as an error — and one
      // such row made the status line claim failure for the rest of the day.
      errors: outcome.error ?? null,
      dropped: outcome.dropped.length ? outcome.dropped.join(" | ") : null,
      webSearchDegraded: outcome.webSearchDegraded ?? false,
    })
    .returning({ id: sweepRuns.id });

  let signalsWritten = 0;
  let accountsDiscovered = 0;

  for (const item of outcome.items) {
    const { accountId, discovered } = await upsertAccount(orgId, item);
    if (discovered) accountsDiscovered++;

    // Upsert on (account, code, date): re-running a sweep the same day should
    // refresh a finding, not duplicate it.
    const existing = await db
      .select({ id: signals.id })
      .from(signals)
      .where(
        and(
          eq(signals.orgId, orgId),
          eq(signals.accountId, accountId),
          eq(signals.code, item.signal),
          eq(signals.date, item.date),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(signals)
        .set({ headline: item.headline, evidence: item.evidence, url: item.url, confidence: item.confidence, sweepId: run.id })
        .where(and(eq(signals.id, existing[0].id), eq(signals.orgId, orgId)));
    } else {
      await db.insert(signals).values({
        orgId,
        accountId,
        code: item.signal,
        tier: item.tier,
        headline: item.headline,
        evidence: item.evidence,
        url: item.url,
        date: item.date,
        confidence: item.confidence,
        sweepId: run.id,
      });
    }
    signalsWritten++;
  }

  return { sweepRunId: run.id, signalsWritten, accountsDiscovered };
}

async function upsertAccount(
  orgId: string,
  item: CleanSweepItem,
): Promise<{ accountId: string; discovered: boolean }> {
  const known = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.name, item.account)))
    .limit(1);

  if (known[0]) {
    // Never downgrade a curated account. A radar find naming an existing
    // client must not reset it to "discovered".
    await db
      .update(accounts)
      .set({ country: sql`coalesce(${accounts.country}, ${item.country})` })
      .where(and(eq(accounts.id, known[0].id), eq(accounts.orgId, orgId)));
    return { accountId: known[0].id, discovered: false };
  }

  const [created] = await db
    .insert(accounts)
    .values({
      orgId,
      name: item.account,
      country: item.country,
      segment: item.segment,
      industry: industryOf(item.segment),
      engine: item.engine,
      status: "discovered",
      firstSeen: new Date().toISOString().slice(0, 10),
      evidence: item.evidence,
    })
    .onConflictDoUpdate({
      target: [accounts.orgId, accounts.name],
      set: { country: item.country },
    })
    .returning({ id: accounts.id });

  return { accountId: created.id, discovered: true };
}
