import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { accounts, member, opportunities, people, signals, user } from "@/db/schema";
import type { SweepItem, UniverseAccount } from "@/domain/scoring";
import type { TowerKey } from "@/domain/revenue";
import { TOWER_KEYS } from "@/domain/practices";

/**
 * Read models for the engine and the studio.
 *
 * Everything here takes an explicit orgId. That is the same value `withOrg()`
 * pins for RLS, so the filter and the database policy agree.
 */

export async function loadUniverse(orgId: string): Promise<UniverseAccount[]> {
  const rows = await db
    .select({
      name: accounts.name,
      country: accounts.country,
      segment: accounts.segment,
      engine: accounts.engine,
      status: accounts.status,
      anchor: accounts.anchor,
      firstSeen: accounts.firstSeen,
      evidence: accounts.evidence,
    })
    .from(accounts)
    .where(eq(accounts.orgId, orgId));

  return rows.map((r) => ({
    name: r.name,
    country: r.country ?? undefined,
    segment: r.segment ?? undefined,
    engine: r.engine ?? undefined,
    status: r.status,
    anchor: r.anchor ?? undefined,
    firstSeen: r.firstSeen ?? undefined,
    evidence: r.evidence ?? undefined,
  }));
}

/** Live signals, newest first, excluding anything the operator dismissed. */
export async function loadSignals(orgId: string): Promise<SweepItem[]> {
  const rows = await db
    .select({
      account: accounts.name,
      code: signals.code,
      date: signals.date,
      evidence: signals.evidence,
      headline: signals.headline,
      url: signals.url,
      country: accounts.country,
      segment: accounts.segment,
      engine: accounts.engine,
    })
    .from(signals)
    .innerJoin(accounts, eq(signals.accountId, accounts.id))
    .where(and(eq(signals.orgId, orgId), isNull(signals.dismissedAt)))
    .orderBy(desc(signals.date))
    .limit(500);

  return rows.map((r) => ({
    account: r.account,
    signal: r.code,
    date: r.date,
    evidence: r.evidence ?? undefined,
    headline: r.headline ?? undefined,
    url: r.url ?? undefined,
    country: r.country ?? undefined,
    segment: r.segment ?? undefined,
    engine: r.engine ?? undefined,
  }));
}

export async function loadVerifiedPeople(orgId: string) {
  return db
    .select({
      name: people.name,
      role: people.role,
      company: accounts.name,
      source: people.source,
    })
    .from(people)
    .innerJoin(accounts, eq(people.accountId, accounts.id))
    .where(eq(accounts.orgId, orgId))
    .limit(200);
}

export interface PipelineCardRow {
  id: string;
  account: string;
  practiceId: string;
  tower: string;
  stage: string;
  value: number;
  tier: string;
  partner: string;
  contact: string;
  next: string;
  due: string;
  touches: number;
  country: string;
  industry: string;
  evidence: string;
  url: string;
  signal: string;
  zohoSyncedAt: string;
}

export async function loadPipeline(orgId: string): Promise<PipelineCardRow[]> {
  const rows = await db
    .select({
      id: opportunities.id,
      account: accounts.name,
      practiceId: opportunities.practiceId,
      tower: opportunities.tower,
      stage: opportunities.stage,
      value: opportunities.value,
      tier: opportunities.tier,
      partnerName: user.name,
      contactRole: opportunities.contactRole,
      contactName: people.name,
      contactTitle: people.role,
      next: opportunities.nextStep,
      due: opportunities.dueOn,
      touches: opportunities.touches,
      country: accounts.country,
      industry: accounts.industry,
      evidence: opportunities.evidence,
      url: opportunities.url,
      signal: opportunities.signalCode,
      zohoSyncedAt: opportunities.zohoSyncedAt,
      createdAt: opportunities.createdAt,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(opportunities.accountId, accounts.id))
    .leftJoin(user, eq(opportunities.partnerUserId, user.id))
    .leftJoin(people, eq(opportunities.contactPersonId, people.id))
    .where(eq(opportunities.orgId, orgId))
    .orderBy(desc(opportunities.createdAt));

  return rows.map((r) => ({
    id: r.id,
    account: r.account,
    practiceId: r.practiceId,
    tower: r.tower,
    stage: r.stage,
    value: r.value,
    tier: r.tier,
    partner: r.partnerName ?? "—",
    // A named person wins; otherwise the role we are aiming at. Never both.
    contact: r.contactName ? `${r.contactName} (${r.contactTitle ?? ""})` : (r.contactRole ?? ""),
    next: r.next ?? "",
    due: r.due ?? "",
    touches: r.touches,
    country: r.country ?? "",
    industry: r.industry ?? "",
    evidence: r.evidence ?? "",
    url: r.url ?? "",
    signal: r.signal ?? "",
    zohoSyncedAt: r.zohoSyncedAt ? r.zohoSyncedAt.toISOString() : "",
  }));
}

/** Tower → partner name, for routing and for the live-state block. */
export async function loadPartnersByTower(orgId: string): Promise<Record<TowerKey, string>> {
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, orgId), eq(member.role, "partner")));

  const out = {} as Record<TowerKey, string>;
  for (const tower of TOWER_KEYS) {
    // Placeholder partners are seeded as "Partner — T3 Hire", so the tower key
    // in the name is what maps them. Renaming in Settings will set an explicit
    // tower column; until then this is the link.
    const match = rows.find((r) => r.name.includes(tower));
    out[tower] = match?.name ?? "—";
  }
  return out;
}

export async function loadPartnerUserIds(orgId: string): Promise<Record<TowerKey, string | null>> {
  const rows = await db
    .select({ id: user.id, name: user.name })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(and(eq(member.organizationId, orgId), eq(member.role, "partner")));

  const out = {} as Record<TowerKey, string | null>;
  for (const tower of TOWER_KEYS) {
    out[tower] = rows.find((r) => r.name.includes(tower))?.id ?? null;
  }
  return out;
}

/** Do-not-contact names for this org (PRD §8). */
export async function loadDnc(orgId: string): Promise<string[]> {
  const rows = await db.execute<{ name: string }>(
    sql`select name from dnc where org_id = ${orgId}`,
  );
  return rows.rows.map((r) => r.name);
}

export { inArray };
