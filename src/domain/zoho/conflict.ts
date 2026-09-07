/**
 * Last write wins (PRD §6), decided from three timestamps.
 *
 * `updatedAt`      — our last local write
 * `zohoSyncedAt`   — our last successful push
 * `zohoModifiedAt` — the remote Modified_Time as of the last time we looked
 *
 * That third one is what makes this answerable at all, and it must include the
 * value Zoho reported for OUR OWN push. Without that, every push bumps
 * Modified_Time, the next reconcile reads our own write back as a remote edit,
 * and the card flaps between local and remote forever.
 */

export type Resolution =
  | { action: "none" }
  | { action: "push" }
  | { action: "pull" }
  | { action: "conflict"; winner: "local" | "remote" };

export interface ResolveInput {
  updatedAt: Date;
  zohoSyncedAt: Date | null;
  zohoModifiedAt: Date | null;
  remoteModifiedTime: Date;
  /**
   * Two different clocks are being compared — Postgres's `now()` and Zoho's
   * server clock. Without a tolerance, a push and a read a few hundred
   * milliseconds apart look like a conflict on every single reconcile.
   */
  skewMs?: number;
}

const DEFAULT_SKEW_MS = 2_000;

export function resolve(input: ResolveInput): Resolution {
  const skew = input.skewMs ?? DEFAULT_SKEW_MS;

  // Never pushed, or changed since we last pushed.
  const localDirty =
    input.zohoSyncedAt === null || input.updatedAt.getTime() > input.zohoSyncedAt.getTime();

  // Changed remotely since we last saw it. A null watermark means we have never
  // recorded a remote time, so anything counts as new.
  const remoteDirty =
    input.zohoModifiedAt === null ||
    input.remoteModifiedTime.getTime() > input.zohoModifiedAt.getTime() + skew;

  if (!localDirty && !remoteDirty) return { action: "none" };
  if (localDirty && !remoteDirty) return { action: "push" };
  if (!localDirty && remoteDirty) return { action: "pull" };

  // Both moved. Later wins — and this is reported as a conflict even when local
  // wins, because a conflict log that records only losses is useless for
  // diagnosing a card that keeps flapping.
  const winner =
    input.updatedAt.getTime() >= input.remoteModifiedTime.getTime() ? "local" : "remote";
  return { action: "conflict", winner };
}
