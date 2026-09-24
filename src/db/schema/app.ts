/**
 * Growth Studio schema (PRD §3).
 *
 * Two rules this file enforces structurally rather than by convention:
 *
 * 1. `people` has NO email, phone, address, or personal-social column. PRD §8
 *    makes that a hard compliance boundary, so the column simply does not
 *    exist — a bug cannot write what there is nowhere to put.
 * 2. Every org-scoped table carries `orgId`, and every query filters on it.
 *    RLS is not enabled — that filter is the isolation. The
 *    repository layer sets `app.org_id` per transaction, so a forgotten filter
 *    fails closed instead of leaking across orgs.
 *
 * Organisations, members, and roles are Better Auth's tables (`./auth`), not
 * ours — one definition of "who belongs to which org", used by both the auth
 * layer. Org-level product settings hang off `settings`.
 *
 * Practices and towers are NOT tables. They are fixed configuration living in
 * `src/domain/practices.ts`, which is unit-tested and the single source of
 * truth; a table would silently drift from it. Opportunities store the
 * practice id as text.
 */

import { relations, sql } from "drizzle-orm";
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

  /**
   * The currency Growth Studio's values are IN — the $20M programme, the
   * wedge/core/whale thresholds, every displayed figure.
   *
   * A column rather than a constant so that moving the product to rupees later
   * is a settings change, not a rewrite of `domain/revenue.ts`,
   * `domain/routing.ts` and every display. `convertAmount` returns its input
   * untouched when the currencies match, so the conversion simply stops.
   */
  baseCurrency: text("base_currency").notNull().default("USD"),

  /**
   * The currency the interface RENDERS in. Display only.
   *
   * Separate from `baseCurrency`, which is what values are stored in and what
   * the tier thresholds and programme target are denominated in. Changing this
   * changes what is on screen and nothing else — no stored value moves, and a
   * $300K card still routes as core.
   *
   * Org-wide rather than per person, which is what lets the server resolve it
   * before the first paint and pass it down as a prop: no cookie, no store, and
   * none of the hydration trap the theme toggle has to work around.
   */
  displayCurrency: text("display_currency").notNull().default("USD"),

  /**
   * USD -> INR, scaled by 10,000 (83.2150 is 832150).
   *
   * An integer because money must not ride on binary floating point. Needed
   * because the connected Zoho org is in INR while values here are USD, and a
   * $300,000 deal pushed unconverted reads as roughly $3,600.
   */
  fxUsdInr: integer("fx_usd_inr"),
  fxUpdatedAt: timestamp("fx_updated_at", { withTimezone: true }),
  /** "manual" | "fetched" — shown so the operator knows which number applied. */
  fxSource: text("fx_source"),
  /**
   * A manually entered rate wins, and the daily fetch SKIPS while this is set.
   * Without it, an override typed in the morning would be silently replaced
   * overnight — which is the exact failure an override exists to prevent.
   */
  fxManualOverride: boolean("fx_manual_override").notNull().default(false),

  /**
   * While true, the push builds every payload and writes NOTHING.
   *
   * Defaults to **on**, deliberately. The target is a live CRM a team uses
   * daily, so no deploy anywhere should be able to create records in it by
   * accident; turning this off is a deliberate act in Settings, taken after
   * someone has read what would land.
   */
  zohoDryRun: boolean("zoho_dry_run").notNull().default(true),

  /**
   * Whether the 05:30 cron sweeps this org. Off means no scheduled model calls
   * at all — no sweeps, no FX fetch, no brief. A manual run still works: this
   * gates the schedule, not the sweep.
   */
  dailySweepEnabled: boolean("daily_sweep_enabled").notNull().default(true),
});

/** Region codes Zoho returns in the callback's `location` parameter. */
export const zohoDataCentres = ["us", "eu", "in", "au", "jp", "ca", "sa", "cn"] as const;

/**
 * The organisation's connection to Zoho CRM (PRD §6, §11).
 *
 * ONE ROW PER ORG, not per user. The PRD's "org-level connection in Settings"
 * means the hourly reconcile runs with no session and no browser, so the
 * connection cannot belong to whoever happened to click Connect.
 * `connectedByUserId` records WHO authorised it without the row being KEYED on
 * them — which is what makes swapping to a dedicated service account later a
 * re-authorise in Settings rather than a migration.
 *
 * NOT on `settings`: that row is `select *`-ed by the settings page and its
 * fields are handed to a client component, so a refresh token there would be
 * one added prop away from the RSC payload. NOT on Better Auth's `account`:
 * that table is per-user, cascades on user delete, is generated by their
 * runtime and hand-patched against drift (scripts/check-auth-schema.mjs), and
 * stores refresh tokens in plaintext.
 *
 * The DOMAINS are stored verbatim, never derived from `dc`. Zoho is
 * region-sharded, a token is not portable across data centres, and the pattern
 * is not derivable — Canada's accounts host is accounts.zohocloud.ca. The
 * callback writes exactly what Zoho returned in `accounts-server` and
 * `api_domain`, so nothing downstream has to guess and a new region cannot
 * break us.
 */
export const zohoConnections = pgTable("zoho_connections", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),

  /** From the callback's `location` parameter. Display and diagnostics only. */
  dc: text("dc", { enum: zohoDataCentres }).notNull(),
  /** `accounts-server` from the callback. Token exchange, refresh, revoke. */
  accountsDomain: text("accounts_domain").notNull(),
  /** `api_domain` from the token response. Every CRM API call. */
  apiDomain: text("api_domain").notNull(),

  /** AES-256-GCM envelope from src/lib/crypto.ts. Never selected by a page. */
  refreshTokenEnc: text("refresh_token_enc").notNull(),

  /**
   * The cached access token, same envelope. CACHED, not minted per call: Zoho
   * allows only 10 access-token requests per 10 minutes, so a worker that
   * refreshed per record would throttle itself within seconds.
   */
  accessTokenEnc: text("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),

  /** What Zoho ACTUALLY granted, as returned — not what we asked for. */
  scope: text("scope").notNull(),

  /** From GET /crm/v8/org, proven live before this row was written. */
  zohoOrgId: text("zoho_org_id"),
  zohoOrgName: text("zoho_org_name"),
  /** ISO 4217. A non-USD org silently corrupts every Amount we push. */
  zohoCurrency: text("zoho_currency"),

  /** Who authorised. Deliberately NO Zoho login address column — §8, and
   *  scripts/check-compliance greps column names for contact shapes. */
  connectedByUserId: text("connected_by_user_id").references(() => user.id, { onDelete: "set null" }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).defaultNow().notNull(),

  lastRefreshAt: timestamp("last_refresh_at", { withTimezone: true }),
  /** Passed through redactSecrets. Set on failure, cleared on success. */
  lastError: text("last_error"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  /**
   * Counted, not parsed. Zoho's OAuth error strings are terse and overloaded,
   * so N consecutive failures is a more reliable signal that a connection is
   * dead than any single error code.
   */
  refreshFailures: integer("refresh_failures").notNull().default(0),

  /** Set when the connection is dead for good (revoked, user deactivated). The
   *  sync stops trying and Settings says reconnect — without this a dead token
   *  burns the 10-per-10-minutes budget forever. */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),

  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    /**
     * The dedupe `persistSweep` has always assumed it had.
     *
     * src/db/sweeps.ts selects on exactly these three columns and then inserts or
     * updates, with the comment "re-running a sweep the same day should refresh a
     * finding, not duplicate it". Under Read Committed, and with Inngest retrying
     * a sweep step, two writers both saw no row and both inserted. Duplicated
     * findings inflate an account's trigger count in `loadAccountList` and in the
     * brief's ranking permanently, because nothing ever collapses them.
     */
    uniqueIndex("signals_account_code_date_uidx").on(t.accountId, t.code, t.date),
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

  /**
   * A HARD failure only — the sweep did not run.
   *
   * This used to also carry the findings we deliberately refused to store, so
   * a sweep that found six, kept four and rejected two wrote a non-null
   * `errors` and was reported as a failure. It was doing its job. There was
   * nowhere else to say so; now there is.
   */
  errors: text("errors"),

  /**
   * Findings the model returned that we declined to store, and why — an
   * unknown signal code, a date in the future, no usable source URL.
   *
   * Worth keeping and worth showing, but it is not a failure.
   */
  dropped: text("dropped"),

  /**
   * Set when Anthropic's web search failed inside a call that still returned
   * HTTP 200 (CLAUDE.md: the error arrives as an object inside
   * `web_search_tool_result`, it does not throw).
   *
   * Not a failure either: the sweep produced findings. But it produced them
   * from the model's memory rather than the live web, which is why the URLs
   * look stale — and without this column there was no way to know that had
   * happened.
   */
  webSearchDegraded: boolean("web_search_degraded").notNull().default(false),
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

    /**
     * Zoho's `Modified_Time` as of the last time we looked — INCLUDING what it
     * reported for our own push. Without that last part every push would bump
     * it, and the next reconcile would read our own write back as a remote
     * edit and flap the card forever.
     */
    zohoModifiedAt: timestamp("zoho_modified_at", { withTimezone: true }),

    /** Why this card is not syncing. Redacted, and never an echoed record (§8). */
    zohoSyncError: text("zoho_sync_error"),
    /** Set when the card must NOT go: on the DNC list, or missing a named contact. */
    zohoBlockedAt: timestamp("zoho_blocked_at", { withTimezone: true }),
    /** Counted, so a permanently bad record stops burning API credit. */
    zohoSyncAttempts: integer("zoho_sync_attempts").notNull().default(0),
  },
  (t) => [
    index("opportunities_org_stage_idx").on(t.orgId, t.stage),
    index("opportunities_org_tower_idx").on(t.orgId, t.tower),
    index("opportunities_account_idx").on(t.accountId),
    // Zoho upserts are keyed on these; both must be idempotent.
    uniqueIndex("opportunities_zoho_lead_idx").on(t.zohoLeadId),
    uniqueIndex("opportunities_zoho_deal_idx").on(t.zohoDealId),
    /**
     * PRD §5's "dedup by account among live cards", enforced.
     *
     * `addCard` selects the account's live cards and then inserts, so two
     * concurrent adds — a double-clicked ＋ Add — both passed the check and
     * produced two live cards for one account. Each then queued its own Zoho
     * create, so the duplicate reached the client's CRM as well.
     *
     * The predicate lists the live stages positively to match `LIVE_STAGES` in
     * src/app/actions/add-card.ts exactly, rather than `not in ('Won','Lost')`:
     * a future terminal stage would silently join a negated list. Change both
     * together.
     */
    uniqueIndex("opportunities_one_live_per_account_uidx")
      .on(t.orgId, t.accountId)
      .where(sql`stage in ('Prospect', 'Plan reach-out', 'Reached out', 'In conversation', 'Meeting set', 'Proposal')`),
  ],
);

/**
 * The intent log that keeps a retry from creating a second record in the
 * client's CRM (PRD §10's "idempotent upserts").
 *
 * `createRecord` has no duplicate check and no external id, and the local
 * `zoho_lead_id` is written in a separate transaction afterwards. Inngest
 * delivers at least once with `retries: 3` and `pushActionFor` recomputes the
 * action from the row, so a retry landing between those two writes saw a null
 * `lead_id` and created the Lead again — in a system of record we do not own.
 *
 * One row per (card, module, key). `sent_at` is stamped immediately before the
 * HTTP call and `remote_id` immediately after, which is what lets
 * `decideCreate` tell "never called" from "called, outcome unknown". The unique
 * index is the whole mechanism: the second execution's insert loses, reads the
 * winner's row, and obeys it.
 */
export const zohoPushAttempts = pgTable(
  "zoho_push_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id").notNull().references(() => opportunities.id, { onDelete: "cascade" }),
    /** "Leads" or "Deals" — the CRM module the record was created in. */
    module: text("module", { enum: ["Leads", "Deals"] }).notNull(),
    /** `pushAttemptKey`: the card id and its `updated_at`. */
    key: text("key").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    remoteId: text("remote_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("zoho_push_attempts_key_uidx").on(t.opportunityId, t.module, t.key),
    // "Which cards are in an unknown state?" is the question an operator asks
    // after an outage, and it must not be a seq scan of the whole log.
    index("zoho_push_attempts_org_idx").on(t.orgId, t.createdAt),
  ],
);

/* ------------------------------------------------------ activity & audit */

export const activityTypes = [
  "added", "draft", "sent", "packet", "replied", "meeting",
  "proposal", "park", "won", "lost", "note", "zoho_push",
  // Access granted by domain allowlist — PRD §8 requires an audit entry on
  // every write, and granting a workspace is a write.
  "member_added",
  // PRD §5 — values are editable, and a card crossing into core is a scoreboard
  // metric (§7) that could not be produced while nothing recorded the crossing.
  "value_changed",
  "wedge_to_core",
  // A radar find that is wrong pollutes ranking forever unless it can be retired.
  "signal_dismissed",
  // Deleting a conversation destroys history, so it is recorded. Creating and
  // renaming one deliberately are not: they are not destructive, and a row per
  // "New conversation" click would bury the entries that matter.
  "conversation_deleted",
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
/**
 * A named chat conversation, one row per conversation per user.
 *
 * Replaces the single rolling `threads` row per user. The messages stay a JSON
 * blob rather than becoming their own table: it is how `threads` already worked,
 * the 200-turn cap applies cleanly per conversation, and a conversation is
 * always read and written whole.
 *
 * `kind` separates the operator's own conversations from the pinned one the
 * scheduled brief writes into, so the morning brief is always in the same place
 * and never lands in the middle of something being worked on.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind", { enum: ["chat", "brief"] }).notNull().default("chat"),
    messagesJson: jsonb("messages_json").$type<unknown[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // The switcher's ordering.
    index("conversations_owner_idx").on(t.orgId, t.userId, t.updatedAt),
    // Exactly one brief conversation per user, so the nightly job can upsert
    // instead of select-then-write. `threads` had no such constraint, which left
    // a race that could silently lose turns.
    uniqueIndex("conversations_one_brief_idx")
      .on(t.orgId, t.userId)
      .where(sql`kind = 'brief'`),
  ],
);

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

/**
 * Authentication failures (PRD §10 — observability).
 *
 * The browser only ever shows a bare status code on a failed sign-in, and the
 * server log is not always reachable. Recording the actual reason here means an
 * auth failure is diagnosable after the fact instead of being reproduced blind.
 *
 * Deliberately holds NO personal data: path, code, message and time only. Never
 * a token, never an email address. §8 applies to diagnostics too.
 */
export const authErrors = pgTable(
  "auth_errors",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    at: timestamp("at", { withTimezone: true }).defaultNow().notNull(),
    path: text("path"),
    code: text("code"),
    message: text("message"),
  },
  (t) => [index("auth_errors_at_idx").on(t.at)],
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
