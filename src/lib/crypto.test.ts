import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The key is read at import, so every case loads a fresh module registry with
 * the environment it wants. Tests are exempt from the `process.env` lint rule.
 */
type CryptoModule = typeof import("./crypto");

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

async function load(env: Record<string, string | undefined>): Promise<CryptoModule> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./crypto");
}

const AAD = "zoho:refresh:org-1";
let originalKey: string | undefined;
let originalPrevious: string | undefined;

beforeEach(() => {
  originalKey = process.env.ZOHO_TOKEN_KEY;
  originalPrevious = process.env.ZOHO_TOKEN_KEY_PREVIOUS;
  // The module logs a config error at import; that is deliberate, not noise
  // worth printing through the suite.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  process.env.ZOHO_TOKEN_KEY = originalKey;
  process.env.ZOHO_TOKEN_KEY_PREVIOUS = originalPrevious;
  if (originalKey === undefined) delete process.env.ZOHO_TOKEN_KEY;
  if (originalPrevious === undefined) delete process.env.ZOHO_TOKEN_KEY_PREVIOUS;
  vi.restoreAllMocks();
});

describe("round trip", () => {
  it("returns exactly what went in", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A, ZOHO_TOKEN_KEY_PREVIOUS: undefined });
    const secret = "1000.abcdef0123456789.fedcba9876543210";
    expect(c.decryptSecret(c.encryptSecret(secret, AAD), AAD)).toBe(secret);
    expect(c.cryptoConfigError).toBeNull();
  });

  it("produces a different envelope every time", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    // A fresh IV per encryption. Identical envelopes would leak that two orgs
    // hold the same token.
    expect(c.encryptSecret("same", AAD)).not.toBe(c.encryptSecret("same", AAD));
  });

  it("stamps the key fingerprint, not the key", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const [version, keyId] = c.encryptSecret("x", AAD).split(".");
    expect(version).toBe("v1");
    expect(keyId).toMatch(/^[0-9a-f]{8}$/);
    expect(keyId).toBe(c.currentKeyId());
    // The envelope must never carry key material.
    expect(KEY_A).not.toContain(keyId);
  });

  it("survives unicode and a long token", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const secret = `${"z".repeat(4000)}·—çé`;
    expect(c.decryptSecret(c.encryptSecret(secret, AAD), AAD)).toBe(secret);
  });
});

describe("integrity", () => {
  it("refuses a tampered ciphertext", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const parts = c.encryptSecret("secret", AAD).split(".");
    parts[4] = Buffer.from("tampered-ciphertext").toString("base64url");
    expect(() => c.decryptSecret(parts.join("."), AAD)).toThrow(
      expect.objectContaining({ reason: "auth-failed" }),
    );
  });

  it("refuses a tampered auth tag", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const parts = c.encryptSecret("secret", AAD).split(".");
    parts[3] = Buffer.from(randomBytes(16)).toString("base64url");
    expect(() => c.decryptSecret(parts.join("."), AAD)).toThrow(
      expect.objectContaining({ reason: "auth-failed" }),
    );
  });

  /**
   * The AAD is what stops one org's ciphertext being pasted into another org's
   * row. Org isolation here is a `where` clause and nothing else — RLS is not
   * enabled — so this is a real second line, not ceremony.
   */
  it("refuses a ciphertext moved to a different org's slot", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const envelope = c.encryptSecret("org one's token", c.refreshTokenAad("org-1"));
    expect(() => c.decryptSecret(envelope, c.refreshTokenAad("org-2"))).toThrow(
      expect.objectContaining({ reason: "auth-failed" }),
    );
  });

  it("refuses a refresh envelope opened as an access token", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const envelope = c.encryptSecret("t", c.refreshTokenAad("org-1"));
    expect(() => c.decryptSecret(envelope, c.accessTokenAad("org-1"))).toThrow(
      expect.objectContaining({ reason: "auth-failed" }),
    );
  });
});

describe("key rotation", () => {
  it("decrypts an envelope written under the previous key", async () => {
    const old = await load({ ZOHO_TOKEN_KEY: KEY_B, ZOHO_TOKEN_KEY_PREVIOUS: undefined });
    const envelope = old.encryptSecret("written before the rotation", AAD);

    const rotated = await load({ ZOHO_TOKEN_KEY: KEY_A, ZOHO_TOKEN_KEY_PREVIOUS: KEY_B });
    expect(rotated.decryptSecret(envelope, AAD)).toBe("written before the rotation");
    // New writes go under the new key.
    expect(rotated.encryptSecret("x", AAD).split(".")[1]).toBe(rotated.currentKeyId());
  });

  /**
   * The failure this whole design exists to make legible: a key that differs
   * between deploys otherwise surfaces as a GCM tag mismatch, which reads
   * exactly like data corruption.
   */
  it("names both fingerprints when the key is simply the wrong one", async () => {
    const other = await load({ ZOHO_TOKEN_KEY: KEY_B, ZOHO_TOKEN_KEY_PREVIOUS: undefined });
    const envelope = other.encryptSecret("t", AAD);
    const otherId = other.currentKeyId();

    const c = await load({ ZOHO_TOKEN_KEY: KEY_A, ZOHO_TOKEN_KEY_PREVIOUS: undefined });
    try {
      c.decryptSecret(envelope, AAD);
      throw new Error("should have thrown");
    } catch (err) {
      const e = err as InstanceType<CryptoModule["SecretDecryptError"]>;
      expect(e.reason).toBe("unknown-key");
      expect(e.envelopeKeyId).toBe(otherId);
      expect(e.serverKeyId).toBe(c.currentKeyId());
      expect(e.message).toContain("reconnecting will not help");
      // Fingerprints only — never key material.
      expect(e.message).not.toContain(KEY_A);
      expect(e.message).not.toContain(KEY_B);
    }
  });
});

describe("malformed input", () => {
  it("rejects envelopes that are not the expected shape", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    for (const bad of ["", "plaintext", "v1.a.b.c", "v2.a.b.c.d", "v1.a.b.c.d.e"]) {
      expect(() => c.decryptSecret(bad, AAD), bad).toThrow(
        expect.objectContaining({ reason: "bad-envelope" }),
      );
    }
  });

  it("rejects a wrong-sized iv or tag rather than letting the cipher throw", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    const parts = c.encryptSecret("secret", AAD).split(".");
    const short = [...parts];
    short[2] = Buffer.from(randomBytes(4)).toString("base64url");
    expect(() => c.decryptSecret(short.join("."), AAD)).toThrow(
      expect.objectContaining({ reason: "bad-envelope" }),
    );
  });
});

describe("configuration", () => {
  it("reports a missing key without throwing at import", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: undefined, ZOHO_TOKEN_KEY_PREVIOUS: undefined });
    // Not a throw: a missing Zoho key must not take down pages that never use it.
    expect(c.cryptoConfigError).toContain("ZOHO_TOKEN_KEY is not set");
    expect(c.currentKeyId()).toBeNull();
    expect(() => c.encryptSecret("x", AAD)).toThrow(
      expect.objectContaining({ reason: "no-key" }),
    );
  });

  it("names the actual length when the key is the wrong size", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: randomBytes(16).toString("base64") });
    expect(c.cryptoConfigError).toContain("exactly 32 bytes");
    expect(c.cryptoConfigError).toContain("got 16");
    expect(c.cryptoConfigError).toContain("openssl rand -base64 32");
  });

  it("ignores an unusable previous key instead of failing outright", async () => {
    // A rotation left half-done must not break decryption under the good key.
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A, ZOHO_TOKEN_KEY_PREVIOUS: "not-32-bytes" });
    expect(c.cryptoConfigError).toBeNull();
    expect(c.decryptSecret(c.encryptSecret("x", AAD), AAD)).toBe("x");
  });

  it("tolerates the multi-line paste readSecret was written for", async () => {
    // The ANTHROPIC_API_KEY incident: a paste that swallowed the following
    // comment header. readSecret keeps only the first line.
    const c = await load({ ZOHO_TOKEN_KEY: `${KEY_A}\n\n# ---- next section ----` });
    expect(c.cryptoConfigError).toBeNull();
    expect(c.decryptSecret(c.encryptSecret("x", AAD), AAD)).toBe("x");
  });
});

describe("safeEqual", () => {
  it("compares without leaking length or content by timing", async () => {
    const c = await load({ ZOHO_TOKEN_KEY: KEY_A });
    expect(c.safeEqual("nonce-abc", "nonce-abc")).toBe(true);
    expect(c.safeEqual("nonce-abc", "nonce-abd")).toBe(false);
    expect(c.safeEqual("short", "much longer value")).toBe(false);
    expect(c.safeEqual("", "")).toBe(true);
  });
});
