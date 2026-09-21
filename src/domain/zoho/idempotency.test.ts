import { describe, expect, it } from "vitest";
import { decideCreate, pushAttemptKey } from "./idempotency";

describe("decideCreate", () => {
  it("creates when nothing has been attempted", () => {
    expect(decideCreate(null)).toEqual({ action: "create" });
  });

  it("creates when a prior attempt was claimed but never sent", () => {
    // The crash landed between writing the intent and the HTTP call, so there is
    // nothing in Zoho to duplicate.
    expect(decideCreate({ remoteId: null, sentAt: null })).toEqual({ action: "create" });
  });

  it("adopts the id from an attempt that succeeded", () => {
    // This is the duplicate that used to happen: the remote write landed, the
    // local write did not, and the retry recomputed CREATE.
    expect(decideCreate({ remoteId: "555", sentAt: new Date("2026-09-21T05:30:00Z") })).toEqual({
      action: "adopt",
      remoteId: "555",
    });
  });

  it("refuses to guess when the call was sent and the outcome is unknown", () => {
    expect(decideCreate({ remoteId: null, sentAt: new Date("2026-09-21T05:30:00Z") })).toEqual({
      action: "unknown",
    });
  });

  it("trusts a remote id even if sentAt was never written", () => {
    // Out-of-order bookkeeping must not lose a record we know exists.
    expect(decideCreate({ remoteId: "555", sentAt: null })).toEqual({
      action: "adopt",
      remoteId: "555",
    });
  });
});

describe("pushAttemptKey", () => {
  const id = "c26598da-8a3f-4b84-a69c-02d541eb8c70";

  it("is stable for an unchanged card, so a retry matches its own attempt", () => {
    const at = new Date("2026-09-21T05:30:00.000Z");
    expect(pushAttemptKey(id, at)).toBe(pushAttemptKey(id, new Date(at)));
  });

  it("changes when the card is edited, so a real second push is not blocked", () => {
    expect(pushAttemptKey(id, new Date("2026-09-21T05:30:00Z"))).not.toBe(
      pushAttemptKey(id, new Date("2026-09-21T06:00:00Z")),
    );
  });

  it("differs per card", () => {
    const at = new Date("2026-09-21T05:30:00Z");
    expect(pushAttemptKey("a", at)).not.toBe(pushAttemptKey("b", at));
  });

  it("does not collapse every unstamped card onto one key by accident", () => {
    // Two different cards with no updatedAt must still differ; only the
    // timestamp half is allowed to degrade.
    expect(pushAttemptKey("a", null)).toBe("a:unknown");
    expect(pushAttemptKey("a", null)).not.toBe(pushAttemptKey("b", null));
  });
});
