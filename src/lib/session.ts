import { randomUUID } from "node:crypto";

import { cache } from "react";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sql } from "drizzle-orm";

import { db, withOrg } from "@/db/client";
import { retryOnConnectionError } from "@/db/retry";
import { activities, member, organization } from "@/db/schema";
import { can, isAllowedEmailDomain, parseAllowedDomains, type Permission } from "@/domain/access";
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
 * Is the browser presenting a session cookie at all?
 *
 * Used only to tell "signed out" apart from "database unreachable" — never as
 * authentication. proxy.ts does the same presence check for cheap redirects.
 */
function hasSessionCookie(h: Headers): boolean {
  return /(^|;\s*)(__Secure-)?better-auth\.session_token=/.test(h.get("cookie") ?? "");
}

/**
 * The authoritative session check.
 *
 * `proxy.ts` only looks for a cookie so signed-out visitors bounce cheaply;
 * this validates the session and resolves which org and role the request runs
 * as. The orgId it returns is what every query filters on, and what
 * `withOrg()` pins in `app.org_id` for the RLS policies that do not exist yet.
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
/**
 * Resolves the session, returning null when nobody is signed in.
 *
 * Split out from `requireSession` because a Route Handler must not redirect:
 * `redirect()` there becomes a real 307, `fetch` follows it, and the client ends
 * up parsing the sign-in page's HTML as an event stream — which left a chat turn
 * spinning on "…" forever and made the palette report "Sweep started" when
 * nothing had started. API routes use this and answer 401.
 *
 * Still throws when the database is unreachable, so that stays distinguishable
 * from being signed out.
 */
type SessionResult =
  | { ok: true; session: StudioSession }
  | { ok: false; reason: "signed-out" | "no-access" };

const resolveStudioSession = cache(async function resolveStudioSession(): Promise<SessionResult> {
  // Retried once on a dropped connection. This single query gates every page in
  // the app, so one dead socket used to render a 500 on whatever the operator
  // happened to be loading. Reads only — provisionMembership below is a write
  // with no unique guard and must never be retried blindly.
  const requestHeaders = await headers();
  const session = await retryOnConnectionError(() =>
    auth.api.getSession({ headers: requestHeaders }),
  );

  if (!session?.user) {
    /**
     * A cookie with no session means one of two very different things: the
     * session really has gone, or the database could not be reached. Better Auth
     * returns null for BOTH — verified by pointing this app at an unreachable
     * host, which produced a silent 307 to /sign-in. Signing an operator out
     * because Neon was slow is the wrong answer: they re-authenticate, it does
     * not help, and nothing tells them why.
     *
     * So when a cookie is present, prove the database is reachable first. If it
     * is not, this throws and the error boundary says so with a retry. The extra
     * query only runs when a cookie exists but a session does not, which is rare
     * — sign-out clears the cookie.
     */
    if (hasSessionCookie(requestHeaders)) await db.execute(sql`select 1`);
    return { ok: false, reason: "signed-out" };
  }

  const userId = session.user.id;
  const existing = await retryOnConnectionError(() =>
    db
      .select({ orgId: member.organizationId, role: member.role, orgName: organization.name })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .limit(1),
  );

  const membership = existing[0] ?? (await provisionMembership(session.user));
  // Signed in with a real Microsoft account but no workspace — a different
  // answer from "not signed in", and it must keep its own destination.
  if (!membership) return { ok: false, reason: "no-access" };

  return {
    ok: true,
    session: {
      userId: session.user.id,
      name: session.user.name,
      email: session.user.email,
      orgId: membership.orgId,
      orgName: membership.orgName,
      role: (membership.role as Role) ?? "viewer",
    },
  };
});

/** The session, or null when nobody is signed in. For Route Handlers. */
export async function getStudioSession(): Promise<StudioSession | null> {
  const result = await resolveStudioSession();
  return result.ok ? result.session : null;
}

/**
 * As `getStudioSession`, but redirects instead of returning null. For pages and
 * server actions only — never a Route Handler.
 */
export async function requireSession(): Promise<StudioSession> {
  const result = await resolveStudioSession();
  if (!result.ok) redirect(result.reason === "no-access" ? "/no-access" : "/sign-in");
  return result.session;
}

/**
 * The sentence an action returns when the role is not permitted.
 *
 * Phrased per permission because "you do not have permission" alone sends the
 * operator to look for a setting rather than for whoever can grant it.
 * `manageIntegrations` keeps its exact previous wording so the three call sites
 * in actions/zoho.ts that already refused read identically.
 */
const PERMISSION_DENIED: Record<Permission, string> = {
  manageIntegrations: "You do not have permission to change integrations.",
  manageSettings: "You do not have permission to change settings.",
  manageCompliance: "You do not have permission to change the do-not-contact list.",
  managePipeline: "You do not have permission to change the pipeline.",
};

/**
 * The authorization half of the guard, to sit under `requireSession()`.
 *
 * Returns the refusal, or null when permitted — so a call site reads
 *
 *     const denied = permissionError(session, "manageCompliance");
 *     if (denied) return denied;
 *
 * and keeps the `{ ok: false, message }` shape every action already returns.
 *
 * It does not redirect and it does not throw. A permission failure is a normal
 * answer the interface should show, not an exception: these are actions the UI
 * ought to have hidden, and when it did not, the operator deserves the reason.
 */
export function permissionError(
  session: StudioSession,
  permission: Permission,
): { ok: false; message: string } | null {
  if (can(session.role, permission)) return null;
  return { ok: false, message: PERMISSION_DENIED[permission] };
}

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

  /**
   * The grant and its audit row together.
   *
   * `0016` gave `member` a unique index on (organization_id, user_id), so the
   * first insert is idempotent now — but the audit row never was, and these
   * committed separately. A failure between them granted somebody a workspace
   * with no record of it, which is the one write PRD §8 is least willing to lose.
   *
   * src/db/retry.ts names this function as the reason writes are never retried on
   * a dropped connection. With the unique index and this transaction, that
   * reasoning is now about the audit row rather than the membership.
   */
  await withOrg(org.id, async (tx) => {
    await tx.insert(member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: DEFAULT_ROLE,
      createdAt: new Date(),
    });

    // PRD §8: audit log on every write. Granting access is a write.
    await tx.insert(activities).values({
      orgId: org.id,
      type: "member_added",
      payloadJson: { email: user.email, role: DEFAULT_ROLE, reason: "allowed email domain" },
      actorId: user.id,
    });
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
