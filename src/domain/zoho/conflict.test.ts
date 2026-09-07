import { describe, expect, it } from "vitest";

import { resolve } from "./conflict";

const t = (iso: string) => new Date(iso);

describe("resolve — the 2×2 of who moved", () => {
  it("does nothing when neither side moved", () => {
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:05:00Z"),
      zohoModifiedAt: t("2026-09-05T10:05:00Z"),
      remoteModifiedTime: t("2026-09-05T10:05:00Z"),
    })).toEqual({ action: "none" });
  });

  it("pushes when only we moved", () => {
    expect(resolve({
      updatedAt: t("2026-09-05T11:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:05:00Z"),
      zohoModifiedAt: t("2026-09-05T10:05:00Z"),
      remoteModifiedTime: t("2026-09-05T10:05:00Z"),
    })).toEqual({ action: "push" });
  });

  it("pulls when only they moved", () => {
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:05:00Z"),
      zohoModifiedAt: t("2026-09-05T10:05:00Z"),
      remoteModifiedTime: t("2026-09-05T12:00:00Z"),
    })).toEqual({ action: "pull" });
  });

  it("gives it to the later write when both moved", () => {
    const both = (localIso: string, remoteIso: string) => resolve({
      updatedAt: t(localIso),
      zohoSyncedAt: t("2026-09-05T10:00:00Z"),
      zohoModifiedAt: t("2026-09-05T10:00:00Z"),
      remoteModifiedTime: t(remoteIso),
    });
    expect(both("2026-09-05T13:00:00Z", "2026-09-05T12:00:00Z"))
      .toEqual({ action: "conflict", winner: "local" });
    expect(both("2026-09-05T12:00:00Z", "2026-09-05T13:00:00Z"))
      .toEqual({ action: "conflict", winner: "remote" });
  });

  it("reports a conflict even when local wins", () => {
    // A conflict log that records only losses cannot explain a flapping card.
    const r = resolve({
      updatedAt: t("2026-09-05T13:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:00:00Z"),
      zohoModifiedAt: t("2026-09-05T10:00:00Z"),
      remoteModifiedTime: t("2026-09-05T12:00:00Z"),
    });
    expect(r.action).toBe("conflict");
  });
});

describe("resolve — the traps", () => {
  /**
   * The one that matters most. Our own push bumps Modified_Time; if that value
   * is not recorded as the watermark, the next reconcile reads our own write
   * back as a remote edit and the card flaps forever.
   */
  it("does not read our own push back as a remote edit", () => {
    const pushedAt = t("2026-09-05T10:05:00Z");
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: pushedAt,
      zohoModifiedAt: pushedAt,       // what Zoho reported for OUR write
      remoteModifiedTime: pushedAt,
    })).toEqual({ action: "none" });
  });

  it("tolerates clock skew between Postgres and Zoho", () => {
    // Two different clocks. Without a tolerance this is a conflict every hour.
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:05:00Z"),
      zohoModifiedAt: t("2026-09-05T10:05:00Z"),
      remoteModifiedTime: t("2026-09-05T10:05:01Z"),  // 1s ahead
    })).toEqual({ action: "none" });
  });

  it("treats a never-synced card as ours to push", () => {
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: null,
      zohoModifiedAt: null,
      remoteModifiedTime: t("2026-09-05T09:00:00Z"),
    }).action).toBe("conflict");
  });

  it("treats an unknown remote watermark as new information", () => {
    expect(resolve({
      updatedAt: t("2026-09-05T10:00:00Z"),
      zohoSyncedAt: t("2026-09-05T10:05:00Z"),
      zohoModifiedAt: null,
      remoteModifiedTime: t("2026-09-05T09:00:00Z"),
    })).toEqual({ action: "pull" });
  });
});
