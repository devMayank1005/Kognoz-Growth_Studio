import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authErrors } from "@/db/schema";
import { isAllowedEmailDomain, parseAllowedDomains } from "@/domain/access";
import { readEnv, readSecret, requireEnv } from "@/lib/env";
import { redactSecrets } from "@/lib/redact";

/**
 * Better Auth owns identity and membership: users, sessions, organizations and
 * roles, all in our own Neon database. No user record leaves the estate, which
 * is what PRD §8's conservative DPDP/PDPL posture asks for.
 *
 * Microsoft Entra SSO only — there is deliberately no email/password path, so
 * there is no password to leak and no shared dev login. E2E tests create a
 * session row directly rather than signing in, so no bypass exists in app code.
 *
 * Redirect URI to register in the Entra app:
 *   {BETTER_AUTH_URL}/api/auth/callback/microsoft
 *
 * ACCESS is two independent layers:
 *   1. MICROSOFT_TENANT_ID pins sign-in to the Kognoz Entra directory.
 *   2. ALLOWED_EMAIL_DOMAINS additionally excludes tenant GUESTS, who keep
 *      their own address and would otherwise see the whole pipeline.
 * Membership itself is granted just-in-time in src/lib/session.ts.
 */
const allowedDomains = parseAllowedDomains(readEnv("ALLOWED_EMAIL_DOMAINS"));

if (allowedDomains.length === 0) {
  throw new Error(
    "ALLOWED_EMAIL_DOMAINS is not set. Refusing to start with an empty allowlist — " +
      "set it to e.g. kognozconsulting.com.",
  );
}
/**
 * The tenant is interpolated straight into Microsoft's endpoint URLs, and a
 * malformed value does not fail loudly — a trailing newline in Vercel produced
 * `.../{tenant}%0A/oauth2/v2.0/token`, which Microsoft refuses as an invalid
 * URL before Entra sees the request. It surfaced only as a sign-in redirect
 * loop, because the authorize leg builds a `URL` (whose parser strips control
 * characters) while the token leg passes a raw string. So validate the shape
 * here, where the error can say what is wrong.
 */
const TENANT_ALIASES = new Set(["common", "organizations", "consumers"]);
const TENANT_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tenantId = readEnv("MICROSOFT_TENANT_ID") ?? "common";

if (!TENANT_GUID.test(tenantId) && !TENANT_ALIASES.has(tenantId.toLowerCase())) {
  throw new Error(
    "MICROSOFT_TENANT_ID must be a tenant GUID or one of common/organizations/consumers. " +
      "It goes into Microsoft's endpoint URLs, so a malformed value fails as an unexplained " +
      "sign-in loop rather than as an error.",
  );
}

const SSO_HINT = "Microsoft SSO is the only sign-in path.";
const clientId = requireEnv("MICROSOFT_CLIENT_ID", SSO_HINT);
// readSecret, not requireEnv: the secret goes into the token request, and a
// multi-line paste would fail as AADSTS7000215 with nothing pointing at why.
const clientSecret = readSecret("MICROSOFT_CLIENT_SECRET");
if (!clientSecret) throw new Error(`MICROSOFT_CLIENT_SECRET is not set. ${SSO_HINT}`);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: readEnv("BETTER_AUTH_URL"),

  socialProviders: {
    microsoft: {
      clientId,
      clientSecret,
      // "common" accepts any Entra tenant. Set MICROSOFT_TENANT_ID to the
      // Kognoz tenant to lock sign-in to the organisation.
      tenantId,
    },
  },

  user: {
    /**
     * Refuse a disallowed address at the auth layer, before any row is
     * written. Bouncing later would leave orphaned user records behind for
     * every guest who ever tried.
     */
    validateUserInfo: ({ user }) => {
      if (isAllowedEmailDomain(user.email, allowedDomains)) return;
      return {
        error: "domain_not_allowed",
        errorDescription: `Growth Studio is limited to ${allowedDomains.join(", ")} accounts.`,
      };
    },
  },

  onAPIError: {
    /**
     * Record why a sign-in failed. Without this the browser shows only
     * "internal_server_error" and the cause is invisible unless someone is
     * watching the server log at the moment it happens.
     */
    onError: async (error, ctx) => {
      const e = error as {
        message?: string;
        body?: { code?: string; message?: string };
        status?: number;
        // Not on AuthContext's type, but present at runtime on the thrown error.
        path?: string;
      };
      const path = e?.path ?? (ctx as unknown as { path?: string })?.path ?? null;
      try {
        await db.insert(authErrors).values({
          path,
          code: e?.body?.code ?? (e?.status ? String(e.status) : null),
          // Redacted and bounded: an error message is diagnostic, not a place
          // for a credential or for arbitrary provider output.
          message: redactSecrets(e?.body?.message ?? e?.message ?? String(error)),
        });
      } catch {
        // Diagnostics must never take down the request they are describing.
      }
      console.error("[auth]", path, e?.body?.code ?? e?.status, e?.body?.message ?? e?.message);
    },
  },

  plugins: [
    organization({
      // One operator dispatching to four partners in v1 (PRD §1). The schema
      // already supports the v1.1 multi-partner model.
      allowUserToCreateOrganization: false,
    }),
  ],

  session: {
    // The operator lives in this app all day; a short session would be friction
    // with no security gain given SSO is the only way in.
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    // Without this, Better Auth pushes expiresAt to now+7d on every request
    // once a session is a day old, so a session used weekly never expires. With
    // SSO-only sign-in, disabling someone in Entra is the only offboarding
    // lever there is, and it did nothing: the live database already held
    // sessions 8+ days old. A hard 7-day cap bounds that window.
    disableSessionRefresh: true,
  },
});

export type Session = typeof auth.$Infer.Session;
