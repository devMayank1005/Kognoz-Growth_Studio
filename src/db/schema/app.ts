/**
 * Growth Studio schema (PRD §3).
 *
 * Two rules this file enforces structurally rather than by convention:
 *
 * 1. `people` has NO email, phone, address, or personal-social column. PRD §8
 *    makes that a hard compliance boundary, so the column simply does not
 *    exist — a bug cannot write what there is nowhere to put.
 * 2. Every org-scoped table carries `orgId`. Postgres RLS keys off it, and the
 *    repository layer sets `app.org_id` per transaction, so a forgotten filter
 *    fails closed instead of leaking across orgs.
 *
 * Organisations, members, and roles are Better Auth's tables (`./auth`), not
 * ours — one definition of "who belongs to which org", used by both the auth
 * layer and RLS. Org-level product settings hang off `settings`.
 *
 * Practices and towers are NOT tables. They are fixed configuration living in
 * `src/domain/practices.ts`, which is unit-tested and the single source of
 * truth; a table would silently drift from it. Opportunities store the
 * practice id as text.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth";

/* ------------------------------------------------------------------ orgs */

export const settings = pgTable("settings", {
  orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  /** Programme clock start — drives monthOf() and the $20M curve. */
  programStart: date("program_start").notNull(),
  targetsJson: jsonb("targets_json").$type<Record<string, number>>(),
  zohoOrgId: text("zoho_org_id"),
  icpText: text("icp_text").notNull(),
  radarMarkets: text("radar_markets").array().notNull().default([]),
  /** Target share of new-logo work, 0-1. PRD §0 locks this at 0.70. */
  mixNewRatio: integer("mix_new_ratio").notNull().default(70),
  zohoBcc: text("zoho_bcc"),
  doctrineJson: jsonb("doctrine_json").$type<Record<string, unknown>>(),
  /** Per-org daily model-call ceiling (PRD §4.1, §11). Soft, logged. */
  dailyCallBudget: integer("daily_call_budget").notNull().default(60),
});

/* -------------------------------------------------------------- accounts */

export const accountStatus = ["client", "prospect", "discovered"] as const;

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    country: text("country"),
    segment: text("segment"),
    /** Derived via domain/industry.ts at write time, stored for cheap grouping. */
    industry: text("industry"),
    engine: text("engine", { enum: ["Hire", "Learn"] }),
    status: text("status", { enum: accountStatus }).notNull().default("prospect"),
    /** Warm path: who could introduce us. */
    anchor: text("anchor"),
    firstSeen: date("first_seen"),
    evidence: text("evidence"),
    zohoAccountId: text("zoho_account_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("accounts_org_name_idx").on(t.orgId, t.name),
    index("accounts_org_status_idx").on(t.orgId, t.status),
  ],
);

/**
 * Stakeholders. PRD §8: name, title, company, date, public source — nothing else.
 * Adding a contact column here is a compliance regression, not a feature.
 */
export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull(),
    /** Public URL the name and title were read from. */
    source: text("source").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    zohoContactId: text("zoho_contact_id"),
  },
  (t) => [index("people_account_idx").on(t.accountId)],
);

/* --------------------------------------------------------------- signals */

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    /** H1..H11, L1..L15, L3b. Validated against domain/signals.ts, not a FK. */
    code: text("code").notNull(),
    tier: integer("tier").notNull(),
    headline: text("headline"),
    evidence: text("evidence"),
    url: text("url"),
    date: date("date").notNull(),
    confidence: integer("confidence"),
    sweepId: uuid("sweep_id").references(() => sweepRuns.id, { onDelete: "set null" }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (t) => [
    index("signals_org_date_idx").on(t.orgId, t.date),
    index("signals_account_idx").on(t.accountId),
  ],
);

export const sweepRuns = pgTable("sweep_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  kind: text("kind", { enum: ["standard", "radar"] }).notNull(),
  market: text("market"),
  itemsFound: integer("items_found").notNull().default(0),
  errors: text("errors"),
});

/* --------------------------------------------------------- opportunities */

export const stages = [
  "Prospect",
  "Plan reach-out",
  "Reached out",
  "In conversation",
  "Meeting set",
  "Proposal",
  "Won",
  "Lost",
] as const;

export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    /** Practice id from domain/practices.ts, e.g. "hire". */
    practiceId: text("practice_id").notNull(),
    tower: text("tower", { enum: ["T1", "T2", "T3", "T4"] }).notNull(),
    partnerUserId: text("partner_user_id").references(() => user.id, { onDelete: "set null" }),
    stage: text("stage", { enum: stages }).notNull().default("Prospect"),
    tier: text("tier", { enum: ["wedge", "core", "whale"] }).notNull(),
    value: integer("value").notNull(),
    whale: boolean("whale").notNull().default(false),
    /** Either a verified person, or the role we are aiming at. Never both. */
    contactPersonId: uuid("contact_person_id").references(() => people.id, { onDelete: "set null" }),
    contactRole: text("contact_role"),
    signalCode: text("signal_code"),
    evidence: text("evidence"),
    url: text("url"),
    nextStep: text("next_step"),
    dueOn: date("due_on"),
    touches: integer("touches").notNull().default(0),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    zohoLeadId: text("zoho_lead_id"),
    zohoDealId: text("zoho_deal_id"),
    zohoSyncedAt: timestamp("zoho_synced_at", { withTimezone: true }),
  },
  (t) => [
    index("opportunities_org_stage_idx").on(t.orgId, t.stage),
    index("opportunities_org_tower_idx").on(t.orgId, t.tower),
    index("opportunities_account_idx").on(t.accountId),
    // Zoho upserts are keyed on these; both must be idempotent.
    uniqueIndex("opportunities_zoho_lead_idx").on(t.zohoLeadId),
    uniqueIndex("opportunities_zoho_deal_idx").on(t.zohoDealId),
  ],
);

/* ------------------------------------------------------ activity & audit */

export const activityTypes = [
  "added", "draft", "sent", "packet", "replied", "meeting",
  "proposal", "park", "won", "lost", "note", "zoho_push",
  // Access granted by domain allowlist — PRD §8 requires an audit entry on
  // every write, and granting a workspace is a write.
  "member_added",
] as const;

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").references(() => opportunities.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type", { enum: activityTypes }).notNull(),
    payloadJson: jsonb("payload_json").$type<Record<string, unknown>>(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("activities_opportunity_idx").on(t.opportunityId),
    index("activities_org_at_idx").on(t.orgId, t.at),
  ],
);

export const drafts = pgTable("drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const insights = pgTable("insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  dim: text("dim", { enum: ["tower", "geo", "industry"] }).notNull(),
  key: text("key").notNull(),
  pattern: text("pattern").notNull(),
  play: text("play").notNull(),
  first: text("first").notNull(),
  at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
});

/** Chat history, one thread per user. */
export const threads = pgTable("threads", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  messagesJson: jsonb("messages_json").$type<unknown[]>().notNull().default([]),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Do-not-contact. Checked on add, draft, and packet (PRD §8). */
export const dnc = pgTable(
  "dnc",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["company", "person"] }).notNull(),
    reason: text("reason"),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("dnc_org_name_idx").on(t.orgId, t.name)],
);

/**
 * Which tower a partner owns (PRD §1, §5).
 *
 * A separate table rather than a column on Better Auth's `member`: that table
 * is generated from their runtime, and adding to it invites a regenerate to
 * clobber it. This also replaces the seeder's original trick of matching the
 * tower key inside the partner's NAME, which broke the moment a placeholder
 * was renamed to a real person.
 */
export const partnerTowers = pgTable(
  "partner_towers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    tower: text("tower", { enum: ["T1", "T2", "T3", "T4"] }).notNull(),
  },
  (t) => [uniqueIndex("partner_towers_org_tower_idx").on(t.orgId, t.tower)],
);

/** Model-call ledger backing the per-org daily budget guard (PRD §4.1). */
export const modelCalls = pgTable(
  "model_calls",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    model: text("model").notNull(),
    speed: text("speed"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("model_calls_org_at_idx").on(t.orgId, t.at)],
);

/* ------------------------------------------------------------- relations */

export const accountsRelations = relations(accounts, ({ many }) => ({
  signals: many(signals),
  people: many(people),
  opportunities: many(opportunities),
}));

export const opportunitiesRelations = relations(opportunities, ({ one, many }) => ({
  account: one(accounts, { fields: [opportunities.accountId], references: [accounts.id] }),
  contactPerson: one(people, { fields: [opportunities.contactPersonId], references: [people.id] }),
  activities: many(activities),
  drafts: many(drafts),
}));

export const signalsRelations = relations(signals, ({ one }) => ({
  account: one(accounts, { fields: [signals.accountId], references: [accounts.id] }),
  sweep: one(sweepRuns, { fields: [signals.sweepId], references: [sweepRuns.id] }),
}));
