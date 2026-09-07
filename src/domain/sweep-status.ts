/**
 * What the last sweep actually did (PRD §2 — the status line).
 *
 * Pure, because the arithmetic here is where the bug was. `loadSweepStatus`
 * asked "did ANY run today report anything?" over every row since UTC midnight,
 * so a single transient failure at 05:36 kept the strip saying "last sweep
 * reported errors" for the rest of the day — through a completely clean run at
 * 11:39 that swept all eleven markets. A clean run could not clear it. Only
 * midnight could.
 */

export interface SweepRow {
  startedAt: Date;
  market: string | null;
  itemsFound: number;
  /** A hard failure — the sweep did not run. */
  errors: string | null;
  /** Findings we refused to store. Not a failure. */
  dropped: string | null;
  webSearchDegraded: boolean;
}

/**
 * Rows within this of the newest one belong to the same run.
 *
 * Sweeps are stored per market, not per batch, so a "run" is a time cluster.
 * Eleven markets take about eleven minutes; the scheduled 05:30 and a manual
 * 11:39 are hours apart. Thirty minutes separates those cleanly without needing
 * a batch id on the table.
 */
export const BATCH_WINDOW_MS = 30 * 60_000;

/** The most recent run: the newest row and everything close behind it. */
export function latestBatch(rows: readonly SweepRow[]): SweepRow[] {
  if (rows.length === 0) return [];
  const newest = rows.reduce((a, b) => (a.startedAt > b.startedAt ? a : b));
  const floor = newest.startedAt.getTime() - BATCH_WINDOW_MS;
  return rows
    .filter((r) => r.startedAt.getTime() >= floor)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

export interface SweepSummary {
  /** Markets in the most recent run. */
  markets: number;
  failed: string[];
  itemsFound: number;
  /** Findings refused across the run. Worth showing; not a failure. */
  droppedCount: number;
  webSearchDegraded: boolean;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export function summariseLatest(rows: readonly SweepRow[]): SweepSummary {
  const batch = latestBatch(rows);
  if (batch.length === 0) {
    return {
      markets: 0, failed: [], itemsFound: 0, droppedCount: 0,
      webSearchDegraded: false, startedAt: null, finishedAt: null,
    };
  }

  return {
    markets: batch.length,
    failed: batch.filter((r) => r.errors).map((r) => r.market ?? "a market"),
    itemsFound: batch.reduce((n, r) => n + r.itemsFound, 0),
    // Counted, not concatenated: the strip has room for a number, not reasons.
    droppedCount: batch.reduce((n, r) => n + (r.dropped ? r.dropped.split(" | ").length : 0), 0),
    webSearchDegraded: batch.some((r) => r.webSearchDegraded),
    startedAt: batch[0].startedAt,
    finishedAt: batch[batch.length - 1].startedAt,
  };
}

/**
 * The line for the status strip, or null when there is nothing worth saying.
 *
 * Silence is the correct output for a healthy run. The strip is meant to be
 * quiet — a message that is always there is one nobody reads.
 */
export function sweepWarning(summary: SweepSummary): string | null {
  if (summary.failed.length > 0) {
    const named = summary.failed.slice(0, 2).join(", ");
    const rest = summary.failed.length > 2 ? ` +${summary.failed.length - 2} more` : "";
    return `${named}${rest} did not sweep`;
  }
  // Findings arrived, but from the model's memory rather than the live web.
  if (summary.webSearchDegraded) return "web search was unavailable — sources may be stale";
  return null;
}
