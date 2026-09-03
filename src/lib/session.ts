import { randomUUID } from "node:crypto";

import { cache } from "react";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { activities, member, organization } from "@/db/schema";
import { isAllowedEmailDomain, parseAllowedDomains } from "@/domain/access";
import { auth } from "@/lib/auth";
import { readEnv } from "@/lib/env";

/** The four roles from PRD §1. */
export type Role = "operator" | "partner" | "viewer" | "admin";

/**
 * Role granted on first sign-in to someone from an allowed domain.
 *
 * `operator` because the firm is lean and PRD §8 wants full transparency —
 * "ownership governs action, not sight". Individuals can be demoted once the
 * Partner and Viewer screens exist in v1.1.
 */
const DEFAULT_ROLE: Role = "operator";

/** The workspace new members join. */
const DEFAULT_ORG_SLUG = readEnv("DEFAULT_ORG_SLUG") ?? "kognoz-konverz";

export interface StudioSession {
  userId: string;
  name: string;
  email: string;
  orgId: string;
  orgName: string;
  role: Role;
}

/**
 * The authoritative session check.
 *
 * `proxy.ts` only looks for a cookie so signed-out visitors bounce cheaply;
 * this validates the session and resolves which org and role the request runs
 * as. The orgId it returns is what `withOrg()` pins for RLS.
 *
 * Wrapped in React `cache()` so it runs once per request: the studio layout
 * and the page beneath it both call it, which was two session lookups and two
 * membership joins for every page view.
 *
 * It also PROVISIONS membership just in time: anyone from an allowed domain
 * gets a workspace on first sign-in, with no admin step. Done here rather than
 * in a user-creation hook because that hook fires only for new users and would
 * never repair an account that already exists without a membership.
 */
export const requireSession = cache(async function requireSession(): Promise<StudioSession> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const existing = await db
    .select({ orgId: member.organizationId, role: member.role, orgName: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, session.user.id))
    .limit(1);

  const membership = existing[0] ?? (await provisionMembership(session.user));
  if (!membership) redirect("/no-access");

  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    orgId: membership.orgId,
    orgName: membership.orgName,
    role: (membership.role as Role) ?? "viewer",
  };
});

interface Membership {
  orgId: string;
  orgName: string;
  role: string;
}

/**
 * Grant a workspace to someone from an allowed domain.
 *
 * Returns null — meaning /no-access — when the address is not allowed (a
 * tenant guest) or when the target workspace cannot be identified
 * unambiguously. Guessing which workspace someone belongs to would be worse
 * than refusing.
 */
async function provisionMembership(user: { id: string; email: string }): Promise<Membership | null> {
  const allowedDomains = parseAllowedDomains(readEnv("ALLOWED_EMAIL_DOMAINS"));
  if (!isAllowedEmailDomain(user.email, allowedDomains)) return null;

  const org = await resolveDefaultOrg();
  if (!org) {
    console.error("[session] no workspace to provision into — is the seed run?");
    return null;
  }

  await db.insert(member).values({
    id: randomUUID(),
    organizationId: org.id,
    userId: user.id,
    role: DEFAULT_ROLE,
    createdAt: new Date(),
  });

  // PRD §8: audit log on every write. Granting access is a write.
  await db.insert(activities).values({
    orgId: org.id,
    type: "member_added",
    payloadJson: { email: user.email, role: DEFAULT_ROLE, reason: "allowed email domain" },
    actorId: user.id,
  });

  return { orgId: org.id, orgName: org.name, role: DEFAULT_ROLE };
}

async function resolveDefaultOrg(): Promise<{ id: string; name: string } | null> {
  const bySlug = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, DEFAULT_ORG_SLUG))
    .limit(1);
  if (bySlug[0]) return bySlug[0];

  // Fall back to the single workspace when there is exactly one. With several
  // and no slug match, refuse rather than pick.
  const all = await db.select({ id: organization.id, name: organization.name }).from(organization).limit(2);
  return all.length === 1 ? all[0] : null;
}
