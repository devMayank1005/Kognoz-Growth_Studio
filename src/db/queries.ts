import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { accounts, activities, opportunities, partnerTowers, people, signals, sweepRuns, user } from "@/db/schema";
import type { SweepItem, UniverseAccount } from "@/domain/scoring";
import type { TowerKey } from "@/domain/revenue";
import { TOWER_KEYS } from "@/domain/practices";
import { cache } from "react";

/**
 * Read models for the engine and the studio.
 *
 * Everything here takes an explicit orgId. That is the same value `withOrg()`
 * pins in `app.org_id`. That GUC has no policy reading it yet, so this filter
 * is the only thing isolating orgs — it is not belt and braces.
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
  /** YYYY-MM-DD, or "" — the day the packet went to the partner. */
  dispatchedAt: string;
  zohoSyncedAt: string;
}

// Deduped per request: the studio layout and /today, /pipeline and /dashboard
// each load it, which meant the same full scan two or three times per view.
export const loadPipeline = cache(async function loadPipeline(orgId: string): Promise<PipelineCardRow[]> {
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
      dispatchedAt: opportunities.dispatchedAt,
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
    // Date only: domain/today.ts builds `${iso}T00:00:00Z`, so a full timestamp
    // would parse to NaN and silently drop the row from the partner-silence list.
    dispatchedAt: r.dispatchedAt ? r.dispatchedAt.toISOString().slice(0, 10) : "",
    zohoSyncedAt: r.zohoSyncedAt ? r.zohoSyncedAt.toISOString() : "",
  }));
});

/** Tower → partner name, for routing and for the live-state block. */
export async function loadPartnersByTower(orgId: string): Promise<Record<TowerKey, string>> {
  const rows = await db
    .select({ tower: partnerTowers.tower, name: user.name })
    .from(partnerTowers)
    .innerJoin(user, eq(partnerTowers.userId, user.id))
    .where(eq(partnerTowers.orgId, orgId));

  const out = {} as Record<TowerKey, string>;
  for (const tower of TOWER_KEYS) {
    out[tower] = rows.find((r) => r.tower === tower)?.name ?? "—";
  }
  return out;
}

export async function loadPartnerUserIds(orgId: string): Promise<Record<TowerKey, string | null>> {
  const rows = await db
    .select({ tower: partnerTowers.tower, id: partnerTowers.userId })
    .from(partnerTowers)
    .where(eq(partnerTowers.orgId, orgId));

  const out = {} as Record<TowerKey, string | null>;
  for (const tower of TOWER_KEYS) out[tower] = rows.find((r) => r.tower === tower)?.id ?? null;
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

export interface SweepStatus {
  /** Sweeps finished today and how many were planned, for the i/n bar. */
  doneToday: number;
  /** Live signals dated today. */
  triggersToday: number;
  lastSweepAt: string | null;
  lastError: string | null;
}

/** Feeds the status line (PRD §2): what the machine is doing, always visible. */
export async function loadSweepStatus(orgId: string): Promise<SweepStatus> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const runs = await db
    .select({ startedAt: sweepRuns.startedAt, errors: sweepRuns.errors, itemsFound: sweepRuns.itemsFound })
    .from(sweepRuns)
    .where(and(eq(sweepRuns.orgId, orgId), gte(sweepRuns.startedAt, since)))
    .orderBy(desc(sweepRuns.startedAt));

  const [trig] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(signals)
    .where(and(eq(signals.orgId, orgId), eq(signals.date, new Date().toISOString().slice(0, 10))));

  const failed = runs.find((r) => r.errors);
  return {
    doneToday: runs.length,
    triggersToday: trig?.n ?? 0,
    lastSweepAt: runs[0]?.startedAt ? runs[0].startedAt.toISOString() : null,
    lastError: failed?.errors ?? null,
  };
}


/* ------------------------------------------------------------- accounts */

export interface AccountListRow {
  id: string;
  name: string;
  country: string;
  industry: string;
  status: "client" | "prospect" | "discovered";
  signalCount: number;
  firstSeen: string | null;
  inPipeline: boolean;
}

/**
 * Just what ⌘K needs to jump to an account.
 *
 * The palette used to be fed by `loadAccountList`, the most expensive query in
 * the app — two left joins, two count(distinct) and a sort over an aggregate —
 * run on EVERY route to render a list of names. This is the same list without
 * the arithmetic nobody was reading.
 */
export const loadAccountOptions = cache(async function loadAccountOptions(orgId: string) {
  return db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.orgId, orgId))
    .orderBy(accounts.name);
});

/** The account universe (§9.9), with live signal counts. */
export async function loadAccountList(orgId: string): Promise<AccountListRow[]> {
  const rows = await db
    .select({
      id: accounts.id,
      name: accounts.name,
      country: accounts.country,
      industry: accounts.industry,
      status: accounts.status,
      firstSeen: accounts.firstSeen,
      signalCount: sql<number>`count(distinct ${signals.id})::int`,
      cardCount: sql<number>`count(distinct ${opportunities.id})::int`,
    })
    .from(accounts)
    .leftJoin(signals, and(eq(signals.accountId, accounts.id), isNull(signals.dismissedAt)))
    .leftJoin(opportunities, eq(opportunities.accountId, accounts.id))
    .where(eq(accounts.orgId, orgId))
    .groupBy(accounts.id)
    .orderBy(desc(sql`count(distinct ${signals.id})`), accounts.name);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country ?? "—",
    industry: r.industry ?? "—",
    status: r.status,
    signalCount: r.signalCount,
    firstSeen: r.firstSeen,
    inPipeline: r.cardCount > 0,
  }));
}

/** Everything the account dossier needs (§9.9). One round of queries. */
export async function loadAccountDossier(orgId: string, accountId: string) {
  const [account] = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.orgId, orgId), eq(accounts.id, accountId)))
    .limit(1);
  if (!account) return null;

  const [accountSignals, accountPeople, cards, timeline] = await Promise.all([
    db
      .select({
        // id is needed so a wrong find can be dismissed from the dossier.
        id: signals.id,
        code: signals.code, tier: signals.tier, headline: signals.headline,
        evidence: signals.evidence, url: signals.url, date: signals.date,
        confidence: signals.confidence,
      })
      .from(signals)
      .where(and(eq(signals.accountId, accountId), isNull(signals.dismissedAt)))
      .orderBy(desc(signals.date)),
    db
      .select({ name: people.name, role: people.role, source: people.source, verifiedAt: people.verifiedAt })
      .from(people)
      .where(eq(people.accountId, accountId)),
    db
      .select({
        id: opportunities.id, practiceId: opportunities.practiceId, tower: opportunities.tower,
        stage: opportunities.stage, value: opportunities.value, partner: user.name,
      })
      .from(opportunities)
      .leftJoin(user, eq(opportunities.partnerUserId, user.id))
      .where(eq(opportunities.accountId, accountId)),
    db
      .select({ type: activities.type, at: activities.at, actor: user.name })
      .from(activities)
      .leftJoin(user, eq(activities.actorId, user.id))
      .where(eq(activities.accountId, accountId))
      .orderBy(desc(activities.at))
      .limit(25),
  ]);

  return { account, signals: accountSignals, people: accountPeople, cards, timeline };
}
