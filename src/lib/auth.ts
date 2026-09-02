import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";

import { db } from "@/db/client";
import * as schema from "@/db/schema";

/**
 * Better Auth owns identity and membership: users, sessions, organizations,
 * and roles. Everything lives in our own Neon database — no user record leaves
 * the estate, which is what PRD §8's conservative DPDP/PDPL posture asks for.
 *
 * The four roles come from PRD §1: operator, partner, viewer, admin.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),

  // Email/password works today so the app is usable before the Google and
  // Microsoft OAuth clients exist. SSO is additive, not a replacement.
  emailAndPassword: { enabled: true },

  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          },
        }
      : {}),
    ...(process.env.MICROSOFT_CLIENT_ID
      ? {
          microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET!,
          },
        }
      : {}),
  },

  plugins: [
    organization({
      // One operator dispatching to four partners in v1 (PRD §1); the schema
      // supports the v1.1 multi-partner model already.
      allowUserToCreateOrganization: true,
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
