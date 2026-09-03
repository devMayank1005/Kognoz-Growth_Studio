import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { authErrors } from "@/db/schema";
import { isAllowedEmailDomain, parseAllowedDomains } from "@/domain/access";

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
const allowedDomains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);

if (allowedDomains.length === 0) {
  throw new Error(
    "ALLOWED_EMAIL_DOMAINS is not set. Refusing to start with an empty allowlist — " +
      "set it to e.g. kognozconsulting.com.",
  );
}
const tenantId = process.env.MICROSOFT_TENANT_ID || "common";

if (!process.env.MICROSOFT_CLIENT_ID || !process.env.MICROSOFT_CLIENT_SECRET) {
  throw new Error(
    "MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET are required — Microsoft SSO is the only sign-in path.",
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  baseURL: process.env.BETTER_AUTH_URL,

  socialProviders: {
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID,
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
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
          // Bounded: an error message is diagnostic, not a place to accumulate
          // arbitrary provider output.
          message: (e?.body?.message ?? e?.message ?? String(error)).slice(0, 800),
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
  },
});

export type Session = typeof auth.$Infer.Session;
