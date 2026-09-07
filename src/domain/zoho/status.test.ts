import { describe, expect, it } from "vitest";

import { blockedCount, isPending, pendingCount, syncStatusOf, type SyncTimes } from "./status";

const card = (over: Partial<SyncTimes> = {}): SyncTimes => ({
  updatedAt: "2026-09-05T10:00:00.000Z",
  zohoSyncedAt: "2026-09-05T10:05:00.000Z",
  ...over,
});

describe("isPending", () => {
  /**
   * The bug this replaces: layout.tsx counted `!zohoSyncedAt`, so a card that
   * synced once and was then edited showed as SYNCED — the opposite of what the
   * operator needs. PRD §12 #6 requires the count to be accurate.
   */
  it("counts a card edited since its last sync", () => {
    expect(isPending(card({ updatedAt: "2026-09-05T11:00:00.000Z" }))).toBe(true);
  });

  it("does not count a card that has not changed since", () => {
    expect(isPending(card())).toBe(false);
  });

  it("counts a card that has never synced", () => {
    expect(isPending(card({ zohoSyncedAt: "" }))).toBe(true);
  });
});

describe("syncStatusOf", () => {
  it("reports off when Zoho is not connected", () => {
    expect(syncStatusOf(card({ zohoSyncedAt: "" }), false)).toBe("off");
  });

  it("ranks blocked above error, because they need different actions", () => {
    // Blocked is "must not go" (§8). Error is "went and failed".
    expect(syncStatusOf(card({ zohoBlockedAt: "2026-09-05", zohoSyncError: "boom" }), true))
      .toBe("blocked");
    expect(syncStatusOf(card({ zohoSyncError: "INVALID_DATA" }), true)).toBe("error");
  });

  it("distinguishes pending from synced", () => {
    expect(syncStatusOf(card({ zohoSyncedAt: "" }), true)).toBe("pending");
    expect(syncStatusOf(card(), true)).toBe("synced");
  });
});

describe("counts", () => {
  const cards = [
    card(),                                              // synced
    card({ zohoSyncedAt: "" }),                          // pending
    card({ updatedAt: "2026-09-05T12:00:00.000Z" }),     // pending — the old bug
    card({ zohoBlockedAt: "2026-09-05" }),               // blocked
    card({ zohoSyncError: "INVALID_DATA" }),             // error
  ];

  it("counts only what is genuinely waiting to go", () => {
    expect(pendingCount(cards, true)).toBe(2);
  });

  it("counts blocked and errored separately, never silently", () => {
    // A quarantined card vanishing from both counts is how a sync stops
    // working without anyone noticing.
    expect(blockedCount(cards)).toBe(2);
  });

  it("reports nothing pending when Zoho is not connected", () => {
    expect(pendingCount(cards, false)).toBe(0);
  });
});
