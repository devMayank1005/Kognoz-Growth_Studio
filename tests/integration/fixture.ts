import { randomUUID } from "node:crypto";

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  accounts, activities, conversations, dnc, member, opportunities, organization,
  partnerTowers, people, settings, signals, sweepRuns, user, zohoPushAttempts,
} from "@/db/schema";

/**
 * Two orgs, so a dropped `where orgId = …` has somewhere to leak from.
 *
 * The unit suite is pure by lint rule and never touches a database, which is
 * right — but it means the isolation every read depends on had no test at all,
 * and RLS is not enabled underneath to catch a mistake. A single-org fixture
 * cannot detect a missing predicate: every row belongs to the only org there is.
 *
 * Each org gets the same shape of data with distinguishable values, so an
 * assertion can say "org A must not see 'B-only'" rather than counting rows.
 */

export interface Tenant {
  orgId: string;
  slug: string;
  userId: string;
  accountId: string;
  opportunityId: string;
  signalId: string;
  conversationId: string;
  sweepRunId: string;
  label: string;
}

export async function seedTenant(label: string): Promise<Tenant> {
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org-${label}-${suffix}`;
  const userId = `user-${label}-${suffix}`;
  const slug = `slug-${label}-${suffix}`;

  await db.insert(organization).values({ id: orgId, name: `Org ${label}`, slug, createdAt: new Date() });
  await db.insert(user).values({
    id: userId, name: `Partner ${label}`, email: `${label}-${suffix}@example.com`,
    emailVerified: true, createdAt: new Date(), updatedAt: new Date(),
  });
  await db.insert(member).values({
    id: `member-${label}-${suffix}`, organizationId: orgId, userId, role: "operator", createdAt: new Date(),
  });
  await db.insert(settings).values({
    orgId, programStart: "2026-01-01", icpText: `ICP ${label}`, radarMarkets: [label],
  });
  await db.insert(partnerTowers).values({ id: randomUUID(), orgId, tower: "T2", userId });

  const [account] = await db.insert(accounts)
    .values({ orgId, name: `${label}-only Account`, country: label, status: "prospect", engine: "Learn" })
    .returning({ id: accounts.id });

  const [run] = await db.insert(sweepRuns)
    .values({ orgId, kind: "standard", startedAt: new Date(), itemsFound: 1 })
    .returning({ id: sweepRuns.id });

  const [signal] = await db.insert(signals)
    .values({
      orgId, accountId: account.id, code: "H1", tier: 1,
      headline: `${label}-only signal`, date: "2026-09-01", sweepId: run.id,
    })
    .returning({ id: signals.id });

  const [card] = await db.insert(opportunities)
    .values({
      orgId, accountId: account.id, practiceId: "hrtx", tower: "T2", tier: "core",
      stage: "Prospect", value: 5_000_000, partnerUserId: userId, nextStep: `${label}-only next step`,
    })
    .returning({ id: opportunities.id });

  await db.insert(people).values({
    accountId: account.id, name: `${label}-only Person`, role: "CHRO", source: "https://example.com",
  });
  await db.insert(dnc).values({ id: randomUUID(), orgId, name: `${label}-only Blocked`, kind: "company", addedBy: userId });
  await db.insert(activities).values({
    orgId, accountId: account.id, opportunityId: card.id, type: "added",
    payloadJson: { note: `${label}-only activity` }, actorId: userId,
  });

  const [conversation] = await db.insert(conversations)
    .values({
      orgId, userId, title: `${label}-only conversation`, kind: "chat",
      messagesJson: [{ role: "user", text: `${label}-only turn`, at: new Date().toISOString() }],
    })
    .returning({ id: conversations.id });

  return {
    orgId, slug, userId, label,
    accountId: account.id, opportunityId: card.id, signalId: signal.id,
    conversationId: conversation.id, sweepRunId: run.id,
  };
}

/** Removes both tenants. `organization` cascades to everything org-scoped. */
export async function dropTenants(...tenants: Tenant[]): Promise<void> {
  // Tolerates undefined: when a beforeAll fails partway, afterAll still runs and
  // must not throw over it and bury the real error.
  const present = tenants.filter(Boolean);
  const orgIds = present.map((t) => t.orgId);
  const userIds = present.map((t) => t.userId);
  if (orgIds.length === 0) return;
  await db.delete(zohoPushAttempts).where(inArray(zohoPushAttempts.orgId, orgIds));
  await db.delete(organization).where(inArray(organization.id, orgIds));
  for (const id of userIds) await db.delete(user).where(eq(user.id, id));
}

/** Every string in `haystack` that belongs to the other tenant. */
export function leaks(haystack: unknown, otherLabel: string): string[] {
  const text = JSON.stringify(haystack ?? null);
  const needle = `${otherLabel}-only`;
  return text.includes(needle) ? [needle] : [];
}
