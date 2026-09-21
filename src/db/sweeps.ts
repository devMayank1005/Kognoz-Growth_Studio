import { and, eq, sql } from "drizzle-orm";

import { withOrg, type Tx } from "@/db/client";
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

  /**
   * One transaction for the whole sweep, so a run row cannot outlive its findings.
   *
   * This used to be a bare `db` insert followed by an unguarded loop, and the run
   * row committed first. A failure at the third of six findings therefore left a
   * `sweep_runs` row asserting `items_found: 6` with two signals stored, plus
   * `discovered` accounts with no signal explaining why they exist — and the
   * status strip read that row as a completed sweep.
   *
   * The connection cost is small enough to be the right trade: this is ONE
   * sweep's findings, a handful of items, not the eleven-sweep loop. It runs
   * inside an Inngest step with no `fetch` anywhere in it, so the rule at
   * CLAUDE.md:300-303 about network calls inside `withOrg` is not in play.
   *
   * An Inngest retry after a rollback will write a second `sweep_runs` row. That
   * is honest — two attempts did happen — and the signals upsert below makes the
   * retry converge instead of throwing.
   */
  return withOrg(orgId, async (tx) => {
    const [run] = await tx
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
      const { accountId, discovered } = await upsertAccount(tx, orgId, item);
      if (discovered) accountsDiscovered++;

      /**
       * One statement, against the unique index `0016` added.
       *
       * The comment here always said "upsert on (account, code, date): re-running
       * a sweep the same day should refresh a finding, not duplicate it" — and it
       * was a select-then-insert, which at Read Committed duplicated under a
       * retry. `0016` gave it `signals_account_code_date_uidx`, which turned the
       * race from a duplicate into a thrown unique violation: worse, because the
       * throw killed the step and the Inngest retry re-ran the Opus call. This is
       * what the comment always described.
       */
      await tx
        .insert(signals)
        .values({
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
        })
        .onConflictDoUpdate({
          target: [signals.accountId, signals.code, signals.date],
          set: {
            headline: item.headline,
            evidence: item.evidence,
            url: item.url,
            confidence: item.confidence,
            sweepId: run.id,
          },
        });
      signalsWritten++;
    }

    return { sweepRunId: run.id, signalsWritten, accountsDiscovered };
  });
}

async function upsertAccount(
  tx: Tx,
  orgId: string,
  item: CleanSweepItem,
): Promise<{ accountId: string; discovered: boolean }> {
  const known = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.name, item.account)))
    .limit(1);

  if (known[0]) {
    // Never downgrade a curated account. A radar find naming an existing
    // client must not reset it to "discovered".
    await tx
      .update(accounts)
      .set({ country: sql`coalesce(${accounts.country}, ${item.country})` })
      .where(and(eq(accounts.id, known[0].id), eq(accounts.orgId, orgId)));
    return { accountId: known[0].id, discovered: false };
  }

  const [created] = await tx
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
