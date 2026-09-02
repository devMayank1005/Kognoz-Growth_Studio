import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { member, organization } from "@/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";

/** The four roles from PRD §1. */
export type Role = "operator" | "partner" | "viewer" | "admin";

export interface StudioSession {
  userId: string;
  name: string;
  orgId: string;
  orgName: string;
  role: Role;
}

/**
 * The authoritative session check.
 *
 * `proxy.ts` only looks for a cookie so signed-out visitors bounce cheaply;
 * this is what actually validates the session and resolves which org and role
 * the request runs as. Every studio page and server action goes through here,
 * and the orgId it returns is what `withOrg()` pins for RLS.
 *
 * Redirects rather than throwing — an expired session should land on sign-in,
 * not an error page.
 */
export async function requireSession(): Promise<StudioSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const rows = await db
    .select({
      orgId: member.organizationId,
      role: member.role,
      orgName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id))
    .limit(1);

  const membership = rows[0];
  if (!membership) {
    // Authenticated with Microsoft but not a member of any org. Signing in is
    // not the same as being invited; say so rather than showing an empty studio.
    redirect("/no-access");
  }

  return {
    userId: session.user.id,
    name: session.user.name,
    orgId: membership.orgId,
    orgName: membership.orgName,
    role: (membership.role as Role) ?? "viewer",
  };
}
