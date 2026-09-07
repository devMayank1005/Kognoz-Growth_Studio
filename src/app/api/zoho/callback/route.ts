import { NextResponse } from "next/server";

import { saveZohoConnection } from "@/db/zoho";
import { assertApiDomain, dcFromAccountsDomain, dcLabel, isZohoDc, ZOHO_DCS, type ZohoDc } from "@/domain/zoho/dc";
import { classifyZohoError } from "@/domain/zoho/errors";
import { redactSecrets } from "@/lib/redact";
import { getStudioSession } from "@/lib/session";
import { zohoClientId, zohoClientSecret, zohoRedirectUri } from "@/lib/zoho/config";
import { zohoGet } from "@/lib/zoho/records";
import { decodeState, nonceMatches, stateCookieName } from "@/lib/zoho/state";

export const dynamic = "force-dynamic";

/**
 * Finishes the Zoho consent flow.
 *
 * Ordered so that every failure is distinguishable and NOTHING is stored until
 * the connection has been proven to work against the live API.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const settings = (outcome: string) => NextResponse.redirect(new URL(`/settings?zoho=${outcome}`, request.url));

  const clearState = (res: NextResponse) => {
    // Cleared on EVERY path, success included, so a replayed callback cannot
    // reuse the nonce.
    res.cookies.set(stateCookieName(), "", { path: "/", maxAge: 0 });
    return res;
  };

  if (params.get("error")) {
    return clearState(settings(params.get("error") === "access_denied" ? "denied" : "failed"));
  }

  const state = decodeState(request.headers.get("cookie")?.match(
    new RegExp(`(?:^|;\\s*)${stateCookieName()}=([^;]+)`),
  )?.[1]);

  if (!state || !nonceMatches(state.nonce, params.get("state"))) {
    console.error("[zoho] callback state did not match");
    return clearState(settings("state"));
  }

  const session = await getStudioSession();
  // The callback must be finished by the same person, in the same browser, in
  // the same org that started it.
  if (!session || session.orgId !== state.orgId || session.userId !== state.userId) {
    return clearState(settings("state"));
  }

  const code = params.get("code");
  if (!code) return clearState(settings("failed"));

  /**
   * Prefer the accounts server Zoho names in the callback over the one we
   * guessed. This is how a wrong ZOHO_ACCOUNTS_DOMAIN self-corrects instead of
   * failing later as an unexplained 401.
   */
  const returned = params.get("accounts-server");
  const location = params.get("location");
  const accountsDomain =
    (returned && dcFromAccountsDomain(returned) ? returned.replace(/\/+$/, "") : null) ??
    (location && isZohoDc(location) ? ZOHO_DCS[location].accounts : null) ??
    ZOHO_DCS[(isZohoDc(state.dc) ? state.dc : "us") as ZohoDc].accounts;

  const dc = dcFromAccountsDomain(accountsDomain) ?? "us";

  // ---------------------------------------------------------------- token
  let token: {
    access_token?: string; refresh_token?: string;
    api_domain?: string; expires_in?: number; scope?: string; error?: string;
  };
  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: zohoClientId(),
      client_secret: zohoClientSecret(),
      // Byte-identical to the authorize leg — both from one helper, never two
      // literals, because Zoho compares them exactly.
      redirect_uri: zohoRedirectUri(),
      code,
    });
    const res = await fetch(`${accountsDomain}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    token = (await res.json()) as typeof token;
  } catch (err) {
    console.error("[zoho] token exchange failed:", redactSecrets(String(err)));
    return clearState(settings("failed"));
  }

  if (token.error || !token.access_token) {
    console.error(`[zoho] token exchange refused: ${redactSecrets(token.error ?? "no access_token")}`);
    return clearState(settings(token.error === "invalid_client" ? "misconfigured" : "failed"));
  }

  /**
   * No refresh token means the connection would be dead in exactly one hour.
   * Refuse rather than store it — Zoho withholds one when the user has already
   * granted this client and `prompt=consent` did not take effect.
   */
  if (!token.refresh_token) {
    console.error("[zoho] Zoho returned no refresh_token");
    return clearState(settings("norefresh"));
  }

  let apiDomain: string;
  try {
    apiDomain = assertApiDomain(token.api_domain ?? "");
  } catch (err) {
    console.error("[zoho] unusable api_domain:", (err as Error).message);
    return clearState(settings("failed"));
  }

  // ------------------------------------------------------------- preflight
  /**
   * Prove the pairing works BEFORE storing anything, and tell the three
   * failure modes apart. Without this branch a missing scope reads as a wrong
   * data centre and costs an afternoon on the wrong problem.
   */
  const org = await zohoGet<{ org?: Array<Record<string, unknown>> }>(
    apiDomain, "/org", token.access_token,
  );

  if (!org.ok) {
    /**
     * Classified by `src/domain/zoho/errors.ts`, which is pure and tested —
     * because the obvious reading is wrong: Zoho returns **401 with
     * OAUTH_SCOPE_MISMATCH** for a missing scope, not 403. Branching on the
     * status here reported a scope problem as a wrong data centre, which is
     * exactly the misdiagnosis this preflight exists to prevent.
     */
    const kind = classifyZohoError(org.error);
    console.error(
      `[zoho] preflight ${kind}: ${org.error.status} ${org.error.code ?? org.error.message}`,
    );

    if (kind === "scope") return clearState(settings("scope"));
    if (kind === "auth") return clearState(settings("wrongdc"));
    return clearState(settings("failed"));
  }

  const orgRow = org.data.org?.[0] ?? {};
  const zohoOrgId = typeof orgRow.zgid === "string" ? orgRow.zgid : null;
  const zohoOrgName = typeof orgRow.company_name === "string" ? orgRow.company_name : null;
  // Zoho returns both `currency` ("Indian Rupee") and `iso_code` ("INR").
  // The ISO code is the one worth storing: it is what code can compare.
  const zohoCurrency =
    (typeof orgRow.iso_code === "string" ? orgRow.iso_code : null) ??
    (typeof orgRow.currency === "string" ? orgRow.currency : null);

  try {
    await saveZohoConnection({
      orgId: session.orgId,
      dc,
      accountsDomain,
      apiDomain,
      refreshToken: token.refresh_token,
      accessToken: token.access_token,
      expiresInSeconds: token.expires_in ?? 3600,
      scope: token.scope ?? "",
      zohoOrgId,
      zohoOrgName,
      zohoCurrency,
      connectedByUserId: session.userId,
    });
  } catch (err) {
    console.error("[zoho] could not store the connection:", redactSecrets(String(err)));
    return clearState(settings("storefailed"));
  }

  console.log(`[zoho] connected to ${zohoOrgName ?? "an org"} (${dcLabel(dc)}), currency ${zohoCurrency ?? "unknown"}`);

  // revalidate happens on the settings page itself; a redirect with a
  // cache-busting param is enough here.
  return clearState(settings("connected"));
}
