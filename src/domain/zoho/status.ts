/**
 * The per-card sync pill and the header's pending count (PRD §6, §9.9).
 *
 * One definition, used by the status line, the top bar, the inspector and the
 * pipeline table. They each had their own inline expression before, and two of
 * them were wrong: `!zohoSyncedAt` counts a card that synced once and was then
 * edited as SYNCED, which is the opposite of what the operator needs to see.
 * PRD §12 #6 requires the count to be accurate.
 */

export type SyncStatus = "off" | "synced" | "pending" | "error" | "blocked";

export interface SyncTimes {
  /** ISO, local last write. */
  updatedAt: string;
  /** ISO, or "" when never pushed. */
  zohoSyncedAt: string;
  /** Set when Zoho refused the record for a reason retrying will not fix. */
  zohoSyncError?: string | null;
  /** Set when the account is on the do-not-contact list (PRD §8). */
  zohoBlockedAt?: string | null;
}

/**
 * The delta rule is the prototype's (docs/konverz-sales-copilot.jsx:743):
 * never synced, or edited since the last sync.
 */
export function isPending(card: SyncTimes): boolean {
  if (!card.zohoSyncedAt) return true;
  if (!card.updatedAt) return false;
  return card.updatedAt > card.zohoSyncedAt;
}

export function syncStatusOf(card: SyncTimes, connected: boolean): SyncStatus {
  if (!connected) return "off";
  // Blocked outranks error: a DNC card is not a failure to fix, it is a card
  // that must not go (§8), and telling those apart is the point of two states.
  if (card.zohoBlockedAt) return "blocked";
  if (card.zohoSyncError) return "error";
  return isPending(card) ? "pending" : "synced";
}

/** Cards waiting to go. Blocked and errored ones are counted separately. */
export function pendingCount(cards: readonly SyncTimes[], connected: boolean): number {
  if (!connected) return 0;
  return cards.filter((c) => syncStatusOf(c, connected) === "pending").length;
}

/**
 * Counted on its own, deliberately. A quarantined card that silently vanished
 * from "pending" is how a sync quietly stops working without anyone noticing.
 */
export function blockedCount(cards: readonly SyncTimes[]): number {
  return cards.filter((c) => c.zohoBlockedAt || c.zohoSyncError).length;
}
