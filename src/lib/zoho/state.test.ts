import { describe, expect, it } from "vitest";

import { decodeState, encodeState, newNonce, nonceMatches, stateCookieOptions } from "./state";

describe("state encoding", () => {
  it("round-trips", () => {
    const p = { nonce: newNonce(), orgId: "org-1", userId: "user-1", dc: "in" };
    expect(decodeState(encodeState(p))).toEqual(p);
  });

  /**
   * Zoho's authorization server mishandles a pipe in the state value, encoded
   * or not. base64url has no pipe — this pins that so nobody changes the
   * encoding to one that does.
   */
  it("produces a nonce with no character Zoho chokes on", () => {
    for (let i = 0; i < 50; i++) {
      expect(newNonce()).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("gives a different nonce every time", () => {
    expect(new Set(Array.from({ length: 50 }, newNonce)).size).toBe(50);
  });

  it("refuses a malformed cookie rather than half-trusting it", () => {
    for (const bad of [undefined, "", "a.b", "a.b.c", "a.b.c.d.e", ".org.user.in"]) {
      expect(decodeState(bad), String(bad)).toBeNull();
    }
  });
});

describe("nonce comparison", () => {
  it("matches only the exact value", () => {
    const n = newNonce();
    expect(nonceMatches(n, n)).toBe(true);
    expect(nonceMatches(n, n.slice(0, -1))).toBe(false);
    expect(nonceMatches(n, null)).toBe(false);
    expect(nonceMatches(n, "")).toBe(false);
  });
});

describe("cookie options", () => {
  /**
   * The one that would break every connect attempt: the callback is a
   * cross-site top-level GET back from Zoho, and Strict would not send the
   * cookie at all.
   */
  it("is Lax, never Strict", () => {
    expect(stateCookieOptions(600).sameSite).toBe("lax");
  });

  it("is HttpOnly and scoped to the whole site", () => {
    const o = stateCookieOptions(600);
    expect(o.httpOnly).toBe(true);
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(600);
  });
});
