-- Enum columns the database will actually refuse.
--
-- Every one of these is `text("col", { enum: [...] })` in src/db/schema/app.ts,
-- which Drizzle enforces at COMPILE TIME ONLY. Before this migration there was
-- not one CHECK constraint anywhere in the schema -- `grep -i "check (" drizzle/*.sql`
-- found nothing across 0000-0014 -- so the column definition in 0000 was, and is,
-- a bare `"stage" text DEFAULT 'Prospect' NOT NULL`.
--
-- Anything writing outside Drizzle could therefore store whatever it liked, and
-- four things do: the hand-written data migrations 0011, 0012 and 0014,
-- scripts/dev-session.mjs, and psql. `addCard(row, { stage: "Won" })` could too,
-- until its second argument was validated in the same change as this migration --
-- the TypeScript signature was the only guard and a server action is a public
-- endpoint. A bogus stage lands in `closedValue` in the studio layout and in the
-- $20M curve on the dashboard: corrupted revenue reporting, no error raised.
--
-- The value lists are duplicated from TypeScript, which is a drift risk, so
-- src/db/schema/enum-checks.test.ts parses THIS FILE and fails if it disagrees
-- with the `as const` arrays. Same guarantee scripts/check-compliance.mts gives
-- §8 by importing the pattern it checks: the constraint and the type cannot part
-- company without a test going red.
--
-- Nullable columns need no special case. A CHECK passes when its expression is
-- UNKNOWN, so `accounts.engine IS NULL` satisfies the constraint below -- which
-- is what we want, since "we do not know the engine yet" is a real state.
--
-- Reversal: ALTER TABLE <t> DROP CONSTRAINT <name>. Nothing is rewritten here,
-- so dropping these restores the previous behaviour exactly.

ALTER TABLE "accounts" ADD CONSTRAINT "accounts_engine_check" CHECK ("engine" IN ('Hire', 'Learn'));
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_status_check" CHECK ("status" IN ('client', 'prospect', 'discovered'));
--> statement-breakpoint
ALTER TABLE "sweep_runs" ADD CONSTRAINT "sweep_runs_kind_check" CHECK ("kind" IN ('standard', 'radar'));
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tower_check" CHECK ("tower" IN ('T1', 'T2', 'T3', 'T4'));
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_tier_check" CHECK ("tier" IN ('wedge', 'core', 'whale'));
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_stage_check" CHECK ("stage" IN ('Prospect', 'Plan reach-out', 'Reached out', 'In conversation', 'Meeting set', 'Proposal', 'Won', 'Lost'));
--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_dim_check" CHECK ("dim" IN ('tower', 'geo', 'industry'));
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_kind_check" CHECK ("kind" IN ('chat', 'brief'));
--> statement-breakpoint
ALTER TABLE "dnc" ADD CONSTRAINT "dnc_kind_check" CHECK ("kind" IN ('company', 'person'));
--> statement-breakpoint
ALTER TABLE "partner_towers" ADD CONSTRAINT "partner_towers_tower_check" CHECK ("tower" IN ('T1', 'T2', 'T3', 'T4'));
--> statement-breakpoint
ALTER TABLE "zoho_connections" ADD CONSTRAINT "zoho_connections_dc_check" CHECK ("dc" IN ('us', 'eu', 'in', 'au', 'jp', 'ca', 'sa', 'cn'));
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_type_check" CHECK ("type" IN ('added', 'draft', 'sent', 'packet', 'replied', 'meeting', 'proposal', 'park', 'won', 'lost', 'note', 'zoho_push', 'member_added', 'value_changed', 'wedge_to_core', 'signal_dismissed', 'conversation_deleted'));
