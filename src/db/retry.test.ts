import { describe, expect, it, vi } from "vitest";

import { isTransientConnectionError, retryOnConnectionError } from "./retry";

const withCode = (code: string) => Object.assign(new Error(`boom ${code}`), { code });

describe("isTransientConnectionError", () => {
  it("recognises the socket-level codes", () => {
    for (const code of ["ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND", "ECONNREFUSED"]) {
      expect(isTransientConnectionError(withCode(code)), code).toBe(true);
    }
  });

  it("recognises the Postgres connection SQLSTATEs", () => {
    for (const code of ["08000", "08003", "08006", "57P01"]) {
      expect(isTransientConnectionError(withCode(code)), code).toBe(true);
    }
  });

  /**
   * 57014 is a statement timeout: the query DID run. Retrying it risks doing the
   * work twice, so it must never be treated as transient.
   */
  it("refuses to treat a statement timeout as transient", () => {
    expect(isTransientConnectionError(withCode("57014"))).toBe(false);
  });

  it("refuses ordinary errors", () => {
    expect(isTransientConnectionError(new Error("syntax error"))).toBe(false);
    expect(isTransientConnectionError(withCode("23505"))).toBe(false);
    expect(isTransientConnectionError(null)).toBe(false);
    expect(isTransientConnectionError(undefined)).toBe(false);
  });

  /** Drizzle wraps the driver error as DrizzleQueryError with a `cause`. */
  it("looks through a cause chain", () => {
    const wrapped = new Error("Failed query: select ...", { cause: withCode("ETIMEDOUT") });
    expect(isTransientConnectionError(wrapped)).toBe(true);
  });

  /**
   * Node's Happy Eyeballs produces an AggregateError holding one error per
   * resolved address — which is exactly what the production log showed.
   */
  it("looks inside an AggregateError's errors", () => {
    const agg = new AggregateError([withCode("ETIMEDOUT"), withCode("ETIMEDOUT")], "all failed");
    expect(isTransientConnectionError(agg)).toBe(true);
    expect(isTransientConnectionError(new Error("wrapped", { cause: agg }))).toBe(true);
  });

  it("survives an AggregateError whose errors is not an array", () => {
    const broken = Object.assign(new Error("odd"), { errors: null });
    expect(() => isTransientConnectionError(broken)).not.toThrow();
    expect(isTransientConnectionError(broken)).toBe(false);
  });

  it("does not loop forever on a self-referencing cause", () => {
    const a = new Error("a") as Error & { cause?: unknown };
    a.cause = a;
    expect(() => isTransientConnectionError(a)).not.toThrow();
  });
});

describe("retryOnConnectionError", () => {
  it("returns the value when the first attempt works", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await retryOnConnectionError(fn, 0)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient failure and succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(withCode("ETIMEDOUT"))
      .mockResolvedValueOnce("second time");
    expect(await retryOnConnectionError(fn, 0)).toBe("second time");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry rather than hammering", async () => {
    const fn = vi.fn().mockRejectedValue(withCode("ETIMEDOUT"));
    await expect(retryOnConnectionError(fn, 0)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("syntax error"));
    await expect(retryOnConnectionError(fn, 0)).rejects.toThrow("syntax error");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
