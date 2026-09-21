import { describe, expect, it } from "vitest";
import { hasRoomForRetry } from "./sweeps";

/**
 * The budget arithmetic that keeps one sweep inside its invocation.
 *
 * Tested here rather than through `runSweep`, which needs an Anthropic key and a
 * live web search. That is the same split the rest of this codebase uses: the
 * decision is pure and tested, the caller that supplies the clock is thin.
 */

const base = {
  attempt: 1,
  maxAttempts: 3,
  elapsedMs: 0,
  lastAttemptMs: 0,
  backoffMs: 2_000,
  budgetMs: 240_000,
};

describe("hasRoomForRetry", () => {
  it("retries a fast early failure", () => {
    // 4s in, an attempt costs 4s, 2s of backoff — nowhere near 240s.
    expect(hasRoomForRetry({ ...base, elapsedMs: 4_000, lastAttemptMs: 4_000 })).toBe(true);
  });

  it("refuses once the attempt count is spent", () => {
    // The third attempt is the last one §4.1 asks for, however much budget is left.
    expect(hasRoomForRetry({ ...base, attempt: 3, elapsedMs: 1_000, lastAttemptMs: 1_000 })).toBe(false);
  });

  it("refuses when the next attempt would not fit in the remaining budget", () => {
    // 150s gone, the last attempt took 100s: 150 + 2 + 100 = 252 > 240.
    // Starting it means being killed mid-flight instead of reporting an error,
    // which takes the whole job and the morning brief down with it.
    expect(hasRoomForRetry({ ...base, attempt: 2, elapsedMs: 150_000, lastAttemptMs: 100_000 })).toBe(false);
  });

  it("allows an attempt that fits exactly", () => {
    // 138 + 2 + 100 = 240, the budget to the millisecond.
    expect(hasRoomForRetry({ ...base, attempt: 2, elapsedMs: 138_000, lastAttemptMs: 100_000 })).toBe(true);
  });

  it("refuses one millisecond past the budget", () => {
    expect(hasRoomForRetry({ ...base, attempt: 2, elapsedMs: 138_001, lastAttemptMs: 100_000 })).toBe(false);
  });

  it("counts the backoff, not just the attempt", () => {
    // Identical elapsed and attempt cost; only the growing backoff differs, and
    // on the second failure it is 4s, not 2s.
    const at = (backoffMs: number) =>
      hasRoomForRetry({ ...base, attempt: 2, elapsedMs: 137_000, lastAttemptMs: 100_000, backoffMs });
    expect(at(2_000)).toBe(true);
    expect(at(4_000)).toBe(false);
  });

  it("does not let a slow first attempt spend the budget twice", () => {
    // One 200s attempt already ate most of it; a second would reach 402s.
    expect(hasRoomForRetry({ ...base, elapsedMs: 200_000, lastAttemptMs: 200_000 })).toBe(false);
  });
});
