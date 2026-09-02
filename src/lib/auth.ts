import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";

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
 */
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
