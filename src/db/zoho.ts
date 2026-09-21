import { eq } from "drizzle-orm";

import { db, withOrg, type Db, type Tx } from "@/db/client";
import { activities, zohoConnections } from "@/db/schema";
import type { ZohoDc } from "@/domain/zoho/dc";
import {
  accessTokenAad, cryptoConfigError, currentKeyId, decryptSecret,
  encryptSecret, refreshTokenAad, SecretDecryptError,
} from "@/lib/crypto";

/**
 * The Zoho connection row.
 *
 * **This is the only module that may select `refresh_token_enc` or
 * `access_token_enc`.** Everything else goes through `loadZohoStatus`, which
 * selects named non-secret columns — that is what makes "a token can never
 * reach a page" a structural fact rather than a review comment, and it is the
 * whole reason this lives in its own table rather than on `settings`.
 */

export interface ZohoConnectionInput {
  orgId: string;
  dc: ZohoDc;
  accountsDomain: string;
  apiDomain: string;
  refreshToken: string;
  accessToken: string;
  expiresInSeconds: number;
  scope: string;
  zohoOrgId: string | null;
  zohoOrgName: string | null;
  zohoCurrency: string | null;
  connectedByUserId: string;
}

/** Everything a page is allowed to know. Deliberately no token fields. */
export type ZohoStatus =
  | { status: "none" }
  | {
      status: "connected";
      dc: ZohoDc;
      apiDomain: string;
      scope: string;
      zohoOrgName: string | null;
      zohoCurrency: string | null;
      connectedByUserId: string | null;
      connectedAt: Date;
      lastRefreshAt: Date | null;
      lastError: string | null;
    }
  | { status: "disabled"; connectedAt: Date; lastError: string | null; lastErrorAt: Date | null }
  /** The stored token cannot be decrypted with this server's key. */
  | { status: "unreadable"; connectedAt: Date; envelopeKeyId?: string; serverKeyId?: string };

/**
 * The connection as a page may see it.
 *
 * A decrypt failure is reported as `unreadable`, NEVER as `none`. Reporting
 * "not connected" would send the operator to reconnect — which burns one of
 * Zoho's 20 refresh tokens per user and does not address the actual cause,
 * a mismatched `ZOHO_TOKEN_KEY`.
 */
export async function loadZohoStatus(orgId: string): Promise<ZohoStatus> {
  const [row] = await db
    .select({
      dc: zohoConnections.dc,
      apiDomain: zohoConnections.apiDomain,
      scope: zohoConnections.scope,
      zohoOrgName: zohoConnections.zohoOrgName,
      zohoCurrency: zohoConnections.zohoCurrency,
      connectedByUserId: zohoConnections.connectedByUserId,
      connectedAt: zohoConnections.connectedAt,
      lastRefreshAt: zohoConnections.lastRefreshAt,
      lastError: zohoConnections.lastError,
      lastErrorAt: zohoConnections.lastErrorAt,
      disabledAt: zohoConnections.disabledAt,
      // The ONE place the envelope is read outside the token path, and only to
      // learn which key it needs — the plaintext is never produced here.
      refreshTokenEnc: zohoConnections.refreshTokenEnc,
    })
    .from(zohoConnections)
    .where(eq(zohoConnections.orgId, orgId))
    .limit(1);

  if (!row) return { status: "none" };

  if (cryptoConfigError || !canDecrypt(row.refreshTokenEnc, orgId)) {
    const keyId = row.refreshTokenEnc.split(".")[1];
    return {
      status: "unreadable",
      connectedAt: row.connectedAt,
      envelopeKeyId: keyId,
      serverKeyId: currentKeyId() ?? undefined,
    };
  }

  if (row.disabledAt) {
    return {
      status: "disabled",
      connectedAt: row.connectedAt,
      lastError: row.lastError,
      lastErrorAt: row.lastErrorAt,
    };
  }

  return {
    status: "connected",
    dc: row.dc as ZohoDc,
    apiDomain: row.apiDomain,
    scope: row.scope,
    zohoOrgName: row.zohoOrgName,
    zohoCurrency: row.zohoCurrency,
    connectedByUserId: row.connectedByUserId,
    connectedAt: row.connectedAt,
    lastRefreshAt: row.lastRefreshAt,
    lastError: row.lastError,
  };
}

function canDecrypt(envelope: string, orgId: string): boolean {
  try {
    decryptSecret(envelope, refreshTokenAad(orgId));
    return true;
  } catch (err) {
    if (err instanceof SecretDecryptError) return false;
    throw err;
  }
}

/** Stores a freshly authorised connection, replacing any previous one. */
export async function saveZohoConnection(input: ZohoConnectionInput): Promise<void> {
  const expiresAt = new Date(Date.now() + input.expiresInSeconds * 1000);

  await withOrg(input.orgId, async (tx) => {
    await tx
      .insert(zohoConnections)
      .values({
        orgId: input.orgId,
        dc: input.dc,
        accountsDomain: input.accountsDomain,
        apiDomain: input.apiDomain,
        refreshTokenEnc: encryptSecret(input.refreshToken, refreshTokenAad(input.orgId)),
        accessTokenEnc: encryptSecret(input.accessToken, accessTokenAad(input.orgId)),
        accessTokenExpiresAt: expiresAt,
        scope: input.scope,
        zohoOrgId: input.zohoOrgId,
        zohoOrgName: input.zohoOrgName,
        zohoCurrency: input.zohoCurrency,
        connectedByUserId: input.connectedByUserId,
        connectedAt: new Date(),
        // A reconnect clears every failure state, or an old error would haunt
        // a connection that is now healthy.
        lastError: null,
        lastErrorAt: null,
        refreshFailures: 0,
        disabledAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: zohoConnections.orgId,
        set: {
          dc: input.dc,
          accountsDomain: input.accountsDomain,
          apiDomain: input.apiDomain,
          refreshTokenEnc: encryptSecret(input.refreshToken, refreshTokenAad(input.orgId)),
          accessTokenEnc: encryptSecret(input.accessToken, accessTokenAad(input.orgId)),
          accessTokenExpiresAt: expiresAt,
          scope: input.scope,
          zohoOrgId: input.zohoOrgId,
          zohoOrgName: input.zohoOrgName,
          zohoCurrency: input.zohoCurrency,
          connectedByUserId: input.connectedByUserId,
          connectedAt: new Date(),
          lastError: null,
          lastErrorAt: null,
          refreshFailures: 0,
          disabledAt: null,
          updatedAt: new Date(),
        },
      });

    /**
     * Connecting is audited too.
     *
     * `disconnectZoho` has always written a `zoho_disconnected` entry and connect
     * wrote nothing, so the audit trail recorded the end of a CRM connection and
     * never the start of one. It goes inside this transaction rather than in the
     * callback route so it cannot be skipped by a caller.
     *
     * No token material, no scope string: §8 applies to diagnostics, and the
     * connection row itself already holds what is needed.
     */
    await tx.insert(activities).values({
      orgId: input.orgId,
      type: "note",
      payloadJson: {
        action: "zoho_connected",
        dc: input.dc,
        zohoOrgName: input.zohoOrgName ?? null,
        currency: input.zohoCurrency ?? null,
      },
      actorId: input.connectedByUserId ?? null,
    });
  });
}

/** The accounts domain and refresh token, for revoking on disconnect. */
export async function loadRevocationData(
  orgId: string,
): Promise<{ accountsDomain: string; refreshToken: string } | null> {
  const [row] = await db
    .select({
      accountsDomain: zohoConnections.accountsDomain,
      refreshTokenEnc: zohoConnections.refreshTokenEnc,
    })
    .from(zohoConnections)
    .where(eq(zohoConnections.orgId, orgId))
    .limit(1);

  if (!row) return null;
  try {
    return {
      accountsDomain: row.accountsDomain,
      refreshToken: decryptSecret(row.refreshTokenEnc, refreshTokenAad(orgId)),
    };
  } catch {
    // Unreadable locally is still disconnectable locally — the operator must
    // then remove it by hand in Zoho's Connected Apps.
    return null;
  }
}

/**
 * Takes an optional runner so the caller can commit the delete with its audit row.
 *
 * `disconnectZoho` has to revoke at Zoho first, and that `fetch` must stay outside
 * any transaction — so only this delete and the activity insert go inside one.
 */
export async function deleteZohoConnection(orgId: string, runner: Db | Tx = db): Promise<boolean> {
  const rows = await runner
    .delete(zohoConnections)
    .where(eq(zohoConnections.orgId, orgId))
    .returning({ orgId: zohoConnections.orgId });
  return rows.length > 0;
}
