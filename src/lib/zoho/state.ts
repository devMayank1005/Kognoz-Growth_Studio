import { randomBytes } from "node:crypto";

import { safeEqual } from "@/lib/crypto";
import { readEnv } from "@/lib/env";

/**
 * The OAuth `state` for the Zoho connect flow.
 *
 * Held in an HttpOnly cookie rather than a database row. That gives the full
 * CSRF property with no table and no cleanup job — an attacker can neither read
 * nor set the cookie — and it additionally binds the callback to the SAME
 * BROWSER that started the flow, which a database row would not.
 */

/**
 * `__Host-` demands Secure, Path=/ and no Domain, which is the strongest
 * prefix available — but it cannot be used over plain http, and local dev is
 * http://localhost. Same split `src/lib/session.ts` already handles for the
 * Better Auth session cookie.
 */
export function stateCookieName(): string {
  return isSecureOrigin() ? "__Host-zoho_oauth_state" : "zoho_oauth_state";
}

function isSecureOrigin(): boolean {
  return (readEnv("BETTER_AUTH_URL") ?? "").startsWith("https://");
}

export interface StatePayload {
  nonce: string;
  orgId: string;
  userId: string;
  dc: string;
}

/**
 * base64url, deliberately.
 *
 * Zoho's authorization server mishandles a `|` in the state value, encoded or
 * not. base64url contains no pipe, so that is satisfied by construction — this
 * comment exists so nobody "improves" the encoding into one that does.
 */
export function newNonce(): string {
  return randomBytes(32).toString("base64url");
}

/** The cookie value. The nonce is the only part echoed to Zoho. */
export function encodeState(p: StatePayload): string {
  return [p.nonce, p.orgId, p.userId, p.dc].join(".");
}

export function decodeState(raw: string | undefined): StatePayload | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== 4) return null;
  const [nonce, orgId, userId, dc] = parts;
  if (!nonce || !orgId || !userId) return null;
  return { nonce, orgId, userId, dc };
}

/** Constant-time, so the comparison cannot be probed a character at a time. */
export function nonceMatches(cookieNonce: string, returned: string | null): boolean {
  if (!returned) return false;
  return safeEqual(cookieNonce, returned);
}

/**
 * `SameSite=Lax`, NOT Strict.
 *
 * The callback is a cross-site top-level GET coming back from Zoho. Under
 * Strict the browser would not send this cookie at all, so state validation
 * would fail on every single connect attempt — a bug that looks like Zoho
 * rejecting us rather than like a cookie policy.
 */
export function stateCookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: isSecureOrigin(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Ten minutes: long enough to sign in to Zoho, short enough to be disposable. */
export const STATE_TTL_SECONDS = 600;
