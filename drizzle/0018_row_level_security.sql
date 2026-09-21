-- Row-level security, which PRD §10 and §11 ask for and which has never existed.
--
-- Verified absent on 2026-09-04 and recorded in CLAUDE.md: pg_policies empty, 0
-- of 22 tables with relrowsecurity, and both connection strings using
-- neondb_owner, which has rolbypassrls = true. `withOrg()` has always set an
-- `app.org_id` GUC that no policy read. Isolation was ~90 hand-written
-- `where org_id = ...` predicates and nothing underneath them.
--
-- THIS MIGRATION DOES NOT YET CHANGE HOW THE APPLICATION BEHAVES, on purpose.
-- The policies are created and the role exists, but DATABASE_URL still connects
-- as the owner, which bypasses RLS. Flipping it is one environment variable --
-- and it must not be flipped yet, because of this:
--
--   `withOrg()` wraps WRITES only. Reads go direct (src/db/client.ts says so).
--   A policy reading current_setting('app.org_id', true) evaluates to NULL
--   outside that transaction, `org_id = NULL` is never true, and EVERY READ IN
--   THE APP RETURNS ZERO ROWS. So the read path has to move through a
--   transaction first.
--
-- That move is not free, and the arithmetic is why it is not in this change.
-- SET LOCAL needs a transaction, so each read gains BEGIN, set_config and
-- COMMIT: three round trips. docs/DEPLOY.md measures 1.4-1.9s warm page loads
-- from India against us-east-2, so at roughly 240ms per round trip that is about
-- 700ms per read. One transaction per REQUEST instead of per query trades that
-- for serialising the studio layout's four parallel loaders on a single
-- connection -- also about 700ms. Both fail the 100ms-per-page budget this was
-- gated on.
--
-- The honest conclusion: enforcing RLS is cheap in the same region and expensive
-- from India to us-east-2. docs/CLAIM-NEON.md already plans a region move to
-- ap-south-1 by restore; that is the change that makes this affordable. Until
-- then the policies sit here, tested, one variable from live.
--
-- tests/integration/rls.test.ts connects AS growth_app and proves the policies
-- actually deny -- so this is verified, not aspirational.
--
-- Reversal: drop each policy, `alter table ... disable row level security`, and
-- `drop role growth_app`. The explicit orgId predicates stay in place underneath
-- throughout, so nothing depends on this to be correct today.

--> statement-breakpoint
-- A role that CANNOT bypass RLS. That is the entire point: neondb_owner can, so
-- granting policies without a new role would change nothing.
--
-- NOLOGIN and no password, deliberately -- a credential in a migration is a
-- credential in git. Give it one out of band when switching over:
--   ALTER ROLE growth_app WITH LOGIN PASSWORD '<from the secret store>';
-- On Neon, create the role through the console or API instead and apply only the
-- GRANTs and policies below.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'growth_app') THEN
    CREATE ROLE growth_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO growth_app;

--> statement-breakpoint
-- DML only. No DDL, no ownership: migrations keep running as the owner over
-- DATABASE_URL_UNPOOLED, which is also why policy changes stay possible.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO growth_app;

--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO growth_app;

--> statement-breakpoint
-- So a table added by a later migration is not silently unreachable.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO growth_app;
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "accounts_org_isolation" ON "accounts"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "activities_org_isolation" ON "activities"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "conversations_org_isolation" ON "conversations"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "dnc" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "dnc_org_isolation" ON "dnc"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "drafts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "drafts_org_isolation" ON "drafts"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "insights" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "insights_org_isolation" ON "insights"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "model_calls" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "model_calls_org_isolation" ON "model_calls"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "opportunities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "opportunities_org_isolation" ON "opportunities"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "partner_towers" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "partner_towers_org_isolation" ON "partner_towers"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "settings" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "settings_org_isolation" ON "settings"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "signals" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "signals_org_isolation" ON "signals"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "sweep_runs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "sweep_runs_org_isolation" ON "sweep_runs"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "threads" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "threads_org_isolation" ON "threads"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "zoho_connections" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "zoho_connections_org_isolation" ON "zoho_connections"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
ALTER TABLE "zoho_push_attempts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "zoho_push_attempts_org_isolation" ON "zoho_push_attempts"
  USING (org_id = current_setting('app.org_id', true))
  WITH CHECK (org_id = current_setting('app.org_id', true));
--> statement-breakpoint
-- `people` has no org_id column -- §8 keeps that table as narrow as it can be --
-- so its policy goes through the account it hangs off. This one matters: it is
-- the table holding named individuals scraped from the public web.
ALTER TABLE "people" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "people_org_isolation" ON "people"
  USING (EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = people.account_id
      AND a.org_id = current_setting('app.org_id', true)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM accounts a
    WHERE a.id = people.account_id
      AND a.org_id = current_setting('app.org_id', true)
  ));
--> statement-breakpoint
-- NO policy on user, session, account, verification, organization, member or
-- invitation, and that is not an omission.
--
-- `resolveStudioSession` reads `member` and `organization` to discover WHICH org
-- the request belongs to. It runs before any org is known, so app.org_id is
-- necessarily unset -- a policy there would make every sign-in resolve to
-- nothing and lock the whole application out. Better Auth's tables describe
-- operators, not prospects, which is the same reason
-- scripts/check-compliance.mts exempts them.
SELECT 1;
