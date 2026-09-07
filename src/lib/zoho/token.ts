import { eq, sql } from "drizzle-orm";

import { withOrg } from "@/db/client";
import { zohoConnections } from "@/db/schema";
import {
  accessTokenAad, decryptSecret, encryptSecret, refreshTokenAad, SecretDecryptError,
} from "@/lib/crypto";
import { redactSecrets } from "@/lib/redact";
import { zohoClientId, zohoClientSecret } from "@/lib/zoho/config";

/**
 * Getting a usable Zoho access token (PRD §6).
 *
 * Two Zoho limits shape everything here:
 *   - an access token lasts **1 hour**;
 *   - only **10 access-token requests per 10 minutes** are allowed.
 *
 * The second is why the token is cached in the connection row rather than
 * minted per call: a sync worker refreshing per record would throttle itself
 * within seconds of starting.
 */

/** Refresh early, so a batch starting at minute 58 never expires mid-run. */
const EARLY_REFRESH_MS = 5 * 60_000;
/** Consecutive failures before the connection is treated as dead. */
const DISABLE_AFTER = 5;

export type TokenResult =
  | { ok: true; accessToken: string; apiDomain: string }
  | {
      ok: false;
      reason: "not-connected" | "disabled" | "unreadable" | "refresh-failed" | "misconfigured";
      message: string;
    };

/**
 * The access token for an org, refreshing it if needed.
 *
 * The refresh is guarded by `SELECT … FOR UPDATE` on the connection row, with
 * the expiry **re-read inside the lock**. That is the whole point: whoever
 * waits on the lock finds the winner's fresh token and makes no network call
 * at all, so N parallel jobs consume one of the ten-per-ten-minutes budget
 * rather than N.
 */
export async function getAccessToken(orgId: string): Promise<TokenResult> {
  return withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select()
      .from(zohoConnections)
      .where(eq(zohoConnections.orgId, orgId))
      .for("update")
      .limit(1);

    if (!row) {
      return { ok: false, reason: "not-connected", message: "Zoho is not connected." } as const;
    }
    if (row.disabledAt) {
      return {
        ok: false,
        reason: "disabled",
        message: row.lastError ?? "Zoho refused this connection. Reconnect in Settings.",
      } as const;
    }

    // Re-checked INSIDE the lock, deliberately — this is the branch that makes
    // the concurrency guard worth having.
    if (
      row.accessTokenEnc &&
      row.accessTokenExpiresAt &&
      row.accessTokenExpiresAt.getTime() - Date.now() > EARLY_REFRESH_MS
    ) {
      try {
        return {
          ok: true,
          accessToken: decryptSecret(row.accessTokenEnc, accessTokenAad(orgId)),
          apiDomain: row.apiDomain,
        } as const;
      } catch {
        // Fall through and refresh: a cached token we cannot read is not a
        // reason to fail if the refresh token is still readable.
      }
    }

    let refreshToken: string;
    try {
      refreshToken = decryptSecret(row.refreshTokenEnc, refreshTokenAad(orgId));
    } catch (err) {
      // A configuration problem, NOT a dead connection. Reporting it as
      // "not connected" would send the operator to reconnect, burning one of
      // Zoho's 20 refresh tokens per user to fix a wrong env var.
      const e = err as SecretDecryptError;
      return {
        ok: false,
        reason: "unreadable",
        message:
          `The stored Zoho token cannot be read with this server's ZOHO_TOKEN_KEY` +
          (e.envelopeKeyId ? ` (stored ${e.envelopeKeyId}, server ${e.serverKeyId ?? "none"})` : "") +
          ". This needs an admin — reconnecting will not help.",
      } as const;
    }

    let body: { access_token?: string; expires_in?: number; error?: string };
    let httpStatus = 0;
    try {
      const res = await fetch(`${row.accountsDomain}/oauth/v2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: zohoClientId(),
          client_secret: zohoClientSecret(),
        }),
        // The pool's statement_timeout bounds the QUERY, not this fetch — and
        // this fetch is holding a pooled connection open inside a transaction.
        signal: AbortSignal.timeout(10_000),
      });
      httpStatus = res.status;
      body = (await res.json()) as typeof body;
    } catch (err) {
      await recordFailure(tx, orgId, row.refreshFailures, `network: ${(err as Error).message}`, false);
      return { ok: false, reason: "refresh-failed", message: "Zoho did not answer. Try again." } as const;
    }

    if (!body.access_token) {
      const code = body.error ?? `http ${httpStatus}`;

      // Terminal vs transient, decided by class rather than by parsing Zoho's
      // error strings — they are terse and overloaded, so counting failures is
      // the more reliable signal.
      const revoked = code === "invalid_grant" || code === "invalid_code";
      // A bad client secret is a CONFIG problem: disabling would invite a
      // reconnect that cannot fix an env var.
      const configProblem = code === "invalid_client";
      const throttled = httpStatus === 429 || /too many requests/i.test(code);

      await recordFailure(tx, orgId, row.refreshFailures, code, revoked, throttled);

      return {
        ok: false,
        reason: configProblem ? "misconfigured" : revoked ? "disabled" : "refresh-failed",
        message: configProblem
          ? "Zoho rejected the client credentials. Check ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET."
          : revoked
            ? "Zoho revoked this connection. Reconnect in Settings."
            : "Zoho would not issue a token. Try again shortly.",
      } as const;
    }

    const expiresAt = new Date(Date.now() + (body.expires_in ?? 3600) * 1000);
    await tx
      .update(zohoConnections)
      .set({
        accessTokenEnc: encryptSecret(body.access_token, accessTokenAad(orgId)),
        accessTokenExpiresAt: expiresAt,
        lastRefreshAt: new Date(),
        lastError: null,
        lastErrorAt: null,
        refreshFailures: 0,
        updatedAt: new Date(),
      })
      .where(eq(zohoConnections.orgId, orgId));

    return { ok: true, accessToken: body.access_token, apiDomain: row.apiDomain } as const;
  });
}

type Tx = Parameters<Parameters<typeof withOrg>[1]>[0];

async function recordFailure(
  tx: Tx,
  orgId: string,
  current: number,
  code: string,
  terminal: boolean,
  throttled = false,
): Promise<void> {
  // A network blip or a 429 must not march a healthy connection toward
  // disabled — only real refusals count.
  const next = throttled ? current : current + 1;
  await tx
    .update(zohoConnections)
    .set({
      refreshFailures: next,
      lastError: (redactSecrets(code) ?? "unknown error").slice(0, 500),
      lastErrorAt: new Date(),
      disabledAt: terminal || next >= DISABLE_AFTER ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(zohoConnections.orgId, orgId));
}

/** Revokes a refresh token at Zoho. Best effort — never blocks a disconnect. */
export async function revokeRefreshToken(
  accountsDomain: string,
  refreshToken: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${accountsDomain}/oauth/v2/token/revoke?token=${encodeURIComponent(refreshToken)}`,
      { method: "POST", signal: AbortSignal.timeout(10_000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export { sql };
