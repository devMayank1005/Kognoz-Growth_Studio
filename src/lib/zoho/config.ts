import { assertAccountsDomain, isZohoDc, ZOHO_DCS, type ZohoDc } from "@/domain/zoho/dc";
import { readEnv, readSecret } from "@/lib/env";

/**
 * Zoho OAuth configuration (PRD §6).
 *
 * A SERVER-BASED APPLICATION, not a Self Client: a Self Client's grant token is
 * bound to whichever Zoho account is signed in to the API Console, which would
 * weld "who owns the app" to "whose data we act as" permanently and make the
 * service-account swap impossible without handing over console access.
 */

const clientId = readEnv("ZOHO_CLIENT_ID");

/**
 * `readSecret`, not `readEnv`. It goes into the token-exchange POST body, where
 * strictly a newline is legal — but a URL-encoded newline in `client_secret`
 * produces Zoho's opaque `invalid_client` with nothing pointing at why, which
 * is exactly the incident class this codebase has already paid for twice.
 */
const clientSecret = readSecret("ZOHO_CLIENT_SECRET");

/** The scopes the connection asks for. Full CRM, settings read-only. */
export const ZOHO_SCOPES =
  readEnv("ZOHO_SCOPES") ??
  [
    // The actual work: read and write Leads, Deals, Accounts, Contacts, Notes.
    "ZohoCRM.modules.ALL",
    // Preflight: is "Growth Studio" a valid Lead_Source, are the six stages
    // present, is Last_Name mandatory. READ only — settings.ALL would let a bug
    // rewrite the client's field layouts.
    "ZohoCRM.settings.fields.READ",
    "ZohoCRM.settings.modules.READ",
    // Currency and org id. The ~83x silent-corruption check.
    "ZohoCRM.org.READ",
    // Partner -> record owner mapping, needed from the push leg onward.
    "ZohoCRM.users.READ",
    // Efficient bulk reads for the hourly reconcile.
    "ZohoCRM.coql.READ",
  ].join(" ");

/**
 * Set when Zoho is not configured, so call sites can say "an admin must fix
 * this" rather than inviting a retry. Deliberately not a throw, mirroring
 * `engineConfigError` (src/engine/client.ts): an unconfigured optional
 * integration must not take down pages that never touch it.
 */
export const zohoConfigError: string | null = (() => {
  if (!clientId) return "ZOHO_CLIENT_ID is not set on the server.";
  if (!clientSecret) return "ZOHO_CLIENT_SECRET is not set on the server.";
  // Zoho client ids look like 1000.XXXXXXXX. Checked because the most likely
  // paste error is grabbing the client SECRET into this slot, and the resulting
  // failure is an opaque invalid_client at the consent screen.
  if (!/^1000\./.test(clientId)) {
    return 'ZOHO_CLIENT_ID does not look like a Zoho client id (it should start with "1000.").';
  }
  try {
    assertAccountsDomain(defaultAccountsDomain());
  } catch (err) {
    return `ZOHO_ACCOUNTS_DOMAIN is not usable: ${(err as Error).message}`;
  }
  return null;
})();

if (zohoConfigError) console.error(`[zoho] ${zohoConfigError}`);

export function zohoClientId(): string {
  if (!clientId) throw new Error(zohoConfigError ?? "ZOHO_CLIENT_ID is not set.");
  return clientId;
}

export function zohoClientSecret(): string {
  if (!clientSecret) throw new Error(zohoConfigError ?? "ZOHO_CLIENT_SECRET is not set.");
  return clientSecret;
}

/** Where the authorize leg starts when the operator does not pick a region. */
export function defaultAccountsDomain(): string {
  return readEnv("ZOHO_ACCOUNTS_DOMAIN") ?? ZOHO_DCS.us.accounts;
}

export function defaultDc(): ZohoDc | null {
  const domain = defaultAccountsDomain();
  for (const code of Object.keys(ZOHO_DCS) as ZohoDc[]) {
    if (ZOHO_DCS[code].accounts === domain.trim().replace(/\/+$/, "")) return code;
  }
  return null;
}

/**
 * The redirect URI, built in ONE place.
 *
 * Zoho matches this byte for byte against what is registered in the API
 * Console, and it must be identical on the authorize leg and the token
 * exchange — two literals in two files is how that silently drifts. The env
 * override exists because a mismatch otherwise needs a redeploy to correct.
 */
export function zohoRedirectUri(): string {
  const override = readEnv("ZOHO_REDIRECT_URI");
  if (override) return override.replace(/\/+$/, "");

  const base = readEnv("BETTER_AUTH_URL");
  if (!base) throw new Error("BETTER_AUTH_URL is not set, so the Zoho redirect URI cannot be built.");
  return `${base.replace(/\/+$/, "")}/api/zoho/callback`;
}

/**
 * The consent URL.
 *
 * `access_type=offline` asks for a refresh token; `prompt=consent` makes a
 * SECOND authorisation re-issue one instead of silently returning none — get
 * that wrong and the connection succeeds and then dies in exactly one hour.
 *
 * Built with `URL`/`searchParams`, never string concatenation: the WHATWG
 * parser is what would have caught the MICROSOFT_TENANT_ID newline.
 */
export function buildAuthorizeUrl(accountsDomain: string, state: string): string {
  const url = new URL(`${assertAccountsDomain(accountsDomain)}/oauth/v2/auth`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", zohoClientId());
  url.searchParams.set("scope", ZOHO_SCOPES);
  url.searchParams.set("redirect_uri", zohoRedirectUri());
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

/** Resolves the accounts domain for a requested region, or the default. */
export function accountsDomainFor(dc: string | null): string {
  if (dc && isZohoDc(dc)) return ZOHO_DCS[dc].accounts;
  return defaultAccountsDomain();
}
