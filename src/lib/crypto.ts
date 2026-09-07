import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { readSecret } from "./env";

/**
 * Encryption at rest for the Zoho refresh token (PRD §6, §11).
 *
 * AES-256-GCM from `node:crypto`: authenticated, in the standard library, no
 * new dependency and no network hop inside the token-refresh path. Not CBC —
 * without an auth tag a flipped bit yields garbage plaintext instead of an
 * error, and this value is about to be sent to Zoho as a credential. Not a KMS
 * — this deploys on Vercel Hobby, and an extra round trip would happen inside a
 * transaction that is already holding a pooled connection.
 *
 * The envelope is `v1.<keyId>.<iv>.<tag>.<ciphertext>`, base64url so no
 * separator can collide with the payload.
 */

/** 12 bytes is GCM's nonce size; 16 is its tag size. */
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const VERSION = "v1";

const b64 = (b: Buffer): string => b.toString("base64url");

/**
 * A short fingerprint of the key, NOT the key.
 *
 * This is what makes rotation possible without a version table, and it is what
 * lets a decrypt failure say "this was encrypted under key a3f21c8b and this
 * server holds 9d40e117" instead of the useless "decryption failed".
 */
function fingerprint(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function parseKey(name: string): { key: Buffer; id: string } | { error: string } {
  const raw = readSecret(name);
  if (raw === undefined) return { error: `${name} is not set on the server.` };

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return { error: `${name} is not valid base64.` };
  }

  // Checked at load, in the spirit of the MICROSOFT_TENANT_ID validation in
  // lib/auth.ts: a value that goes on to be used opaquely must have its shape
  // proven at the boundary, or the failure surfaces somewhere unrecognisable.
  if (key.length !== KEY_BYTES) {
    return {
      error: `${name} must decode to exactly ${KEY_BYTES} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`,
    };
  }
  return { key, id: fingerprint(key) };
}

const primary = parseKey("ZOHO_TOKEN_KEY");

/**
 * Set when the key is missing or malformed.
 *
 * Deliberately not a throw, mirroring `engineConfigError` in
 * `src/engine/client.ts`: a misconfigured Zoho key must not take down the pages
 * that never touch Zoho, and call sites need to distinguish "an admin must fix
 * this" from "retry".
 */
export const cryptoConfigError: string | null = "error" in primary ? primary.error : null;

if (cryptoConfigError) console.error(`[crypto] ${cryptoConfigError}`);

/**
 * Decrypt-only, for a key rotation. Normally absent.
 *
 * With one org and one row, "rotate = Disconnect then Connect" is already a
 * complete rotation. This exists so that is not the only option, not because it
 * is expected to be needed.
 */
const previous = readSecret("ZOHO_TOKEN_KEY_PREVIOUS") === undefined
  ? null
  : parseKey("ZOHO_TOKEN_KEY_PREVIOUS");

if (previous && "error" in previous) {
  console.error(`[crypto] ZOHO_TOKEN_KEY_PREVIOUS ignored: ${previous.error}`);
}

/** Every key this server can decrypt with, by fingerprint. */
function keyring(): Map<string, Buffer> {
  const ring = new Map<string, Buffer>();
  if (!("error" in primary)) ring.set(primary.id, primary.key);
  if (previous && !("error" in previous)) ring.set(previous.id, previous.key);
  return ring;
}

export type DecryptFailure = "no-key" | "bad-envelope" | "unknown-key" | "auth-failed";

export class SecretDecryptError extends Error {
  constructor(
    readonly reason: DecryptFailure,
    message: string,
    /** Fingerprints only — never a key, never the ciphertext. */
    readonly envelopeKeyId?: string,
    readonly serverKeyId?: string,
  ) {
    super(message);
    this.name = "SecretDecryptError";
  }
}

/** The fingerprint of the key this server encrypts with, or null if unusable. */
export function currentKeyId(): string | null {
  return "error" in primary ? null : primary.id;
}

/**
 * Encrypts a credential.
 *
 * `aad` binds the ciphertext to the slot it belongs in — pass
 * `zoho:refresh:{orgId}`. Copying another org's ciphertext into your row then
 * fails the tag check. That costs nothing and closes a real hole, because org
 * isolation in this codebase is a `where` clause and nothing else (RLS is not
 * enabled — CLAUDE.md).
 */
export function encryptSecret(plaintext: string, aad: string): string {
  if ("error" in primary) throw new SecretDecryptError("no-key", primary.error);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", primary.key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(aad, "utf8"));

  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, primary.id, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join(".");
}

/**
 * Decrypts a credential, or throws `SecretDecryptError`.
 *
 * Never returns a partial or empty result: a caller that received "" would send
 * an empty bearer token to Zoho and read the 401 as a revoked grant, which is
 * the wrong diagnosis and invites a reconnect that burns a token slot.
 */
export function decryptSecret(envelope: string, aad: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new SecretDecryptError("bad-envelope", "The stored token is not in the expected format.");
  }

  const [, keyId, ivB64, tagB64, ctB64] = parts;
  const ring = keyring();
  if (ring.size === 0) {
    throw new SecretDecryptError(
      "no-key",
      cryptoConfigError ?? "No usable ZOHO_TOKEN_KEY on this server.",
      keyId,
    );
  }

  const key = ring.get(keyId);
  if (!key) {
    // The message that turns an afternoon of guessing into a one-line env fix.
    throw new SecretDecryptError(
      "unknown-key",
      `The stored token was encrypted with key ${keyId}, but this server holds ${currentKeyId() ?? "none"}. ` +
        "This needs an admin — reconnecting will not help.",
      keyId,
      currentKeyId() ?? undefined,
    );
  }

  let iv: Buffer, tag: Buffer, ct: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64url");
    tag = Buffer.from(tagB64, "base64url");
    ct = Buffer.from(ctB64, "base64url");
  } catch {
    throw new SecretDecryptError("bad-envelope", "The stored token is not decodable.", keyId);
  }
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new SecretDecryptError("bad-envelope", "The stored token is malformed.", keyId);
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(ct), decipher.final()]);
    return out.toString("utf8");
  } catch {
    // GCM failing the tag means tampered ciphertext, the wrong AAD, or a key
    // that fingerprints the same but is not the same. All three are "do not
    // trust this value", and none of them is recoverable by retrying.
    throw new SecretDecryptError(
      "auth-failed",
      "The stored token failed its integrity check and was not used.",
      keyId,
      currentKeyId() ?? undefined,
    );
  }
}

/** The AAD for a connection's refresh token. One definition, both directions. */
export function refreshTokenAad(orgId: string): string {
  return `zoho:refresh:${orgId}`;
}

/** The AAD for a connection's cached access token. */
export function accessTokenAad(orgId: string): string {
  return `zoho:access:${orgId}`;
}

/** Constant-time compare, for the OAuth `state` nonce. */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}
