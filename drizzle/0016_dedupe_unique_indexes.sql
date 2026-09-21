-- The three constraints the application code already assumed it had.
--
-- Each of these guards a select-then-insert. The isolation level is never set
-- anywhere in this codebase, so every one of them runs at Read Committed, where
-- two writers both see "no row" and both insert:
--
--   * signals        src/db/sweeps.ts says "re-running a sweep the same day
--                    should refresh a finding, not duplicate it" -- and Inngest
--                    retries a sweep step, so it re-ran.
--   * opportunities  PRD §5's "dedup by account among live cards". A
--                    double-clicked + Add produced two live cards AND two Zoho
--                    creates, so the duplicate reached the client's CRM.
--   * member         src/lib/session.ts provisions on first sign-in; two tabs
--                    gave two memberships and two audit rows. src/db/retry.ts
--                    already names this as the reason writes are never retried.
--                    resolveStudioSession takes .limit(1), so nobody could see it.
--
-- A unique index cannot be added to a table that already violates it, and this
-- runs against a database that has been live since 0000. So each case is handled
-- on its own terms rather than assuming the data is clean.
--
-- Reversal: DROP INDEX for each of the three. The deletions below are NOT
-- reversible, which is why each writes its audit row first, holding the before
-- state while it is still true -- the same discipline as 0011.

--> statement-breakpoint
-- §8: an entry for every write, captured before the delete.
INSERT INTO activities (org_id, type, payload_json, actor_id)
SELECT
  s.org_id,
  'note',
  jsonb_build_object(
    'action', 'deduplicated_signals',
    'migration', '0016',
    'kept', 'the finding from the most recent sweep',
    'rows', jsonb_agg(
      jsonb_build_object('id', s.id, 'account_id', s.account_id, 'code', s.code, 'date', s.date)
      ORDER BY s.id
    )
  ),
  NULL
FROM signals s
WHERE EXISTS (
  SELECT 1 FROM signals o
  WHERE o.account_id = s.account_id AND o.code = s.code AND o.date = s.date AND o.id <> s.id
)
GROUP BY s.org_id;

--> statement-breakpoint
-- Collapse duplicate findings, keeping the one from the newest sweep.
--
-- `signals` has no created_at (there is no record of when a finding was stored,
-- only of when the news happened) and `id` is gen_random_uuid(), which is not
-- time-ordered -- so ordering by id would pick arbitrarily. sweep_runs.started_at
-- is the real clock here.
WITH ranked AS (
  SELECT
    s.id,
    row_number() OVER (
      PARTITION BY s.account_id, s.code, s.date
      ORDER BY r.started_at DESC NULLS LAST, s.id
    ) AS rn
  FROM signals s
  LEFT JOIN sweep_runs r ON r.id = s.sweep_id
)
DELETE FROM signals WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

--> statement-breakpoint
-- §8 again, for the memberships.
INSERT INTO activities (org_id, type, payload_json, actor_id)
SELECT
  m.organization_id,
  'note',
  jsonb_build_object(
    'action', 'deduplicated_memberships',
    'migration', '0016',
    'kept', 'the earliest grant',
    'rows', jsonb_agg(jsonb_build_object('id', m.id, 'user_id', m.user_id) ORDER BY m.id)
  ),
  NULL
FROM member m
WHERE EXISTS (
  SELECT 1 FROM member o
  WHERE o.organization_id = m.organization_id AND o.user_id = m.user_id AND o.id <> m.id
)
GROUP BY m.organization_id;

--> statement-breakpoint
-- Keep the original grant; the later ones are the race's leftovers. Deleting a
-- member row cascades nothing that matters -- the audit rows it produced carry
-- org_id and actor_id, not a member FK, so the history of the grant survives.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY organization_id, user_id ORDER BY created_at, id
  ) AS rn
  FROM member
)
DELETE FROM member WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

--> statement-breakpoint
-- Opportunities are NOT de-duplicated automatically.
--
-- A live card carries drafts, activities, a partner, a value and possibly a Zoho
-- lead or deal id. Picking one to delete is a business decision, not a data
-- cleanup -- 0014 is what doing it properly looks like, and it had to re-point
-- references before deleting so four audit rows would survive.
--
-- So: refuse, by name, and let a human resolve it. The whole migration is one
-- transaction, so this rolls back everything above it and nothing is half-done.
DO $$
DECLARE
  offenders text;
BEGIN
  SELECT string_agg(format('%s (%s live cards)', a.name, d.n), ', ' ORDER BY a.name)
    INTO offenders
  FROM (
    SELECT org_id, account_id, count(*) AS n
    FROM opportunities
    WHERE stage IN ('Prospect', 'Plan reach-out', 'Reached out', 'In conversation', 'Meeting set', 'Proposal')
    GROUP BY org_id, account_id
    HAVING count(*) > 1
  ) d
  JOIN accounts a ON a.id = d.account_id;

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot add opportunities_one_live_per_account_uidx: % already holds more than one live card. Merge or close the duplicates by hand (drizzle/0014 is the pattern), then re-run this migration.',
      offenders;
  END IF;
END $$;

--> statement-breakpoint
CREATE UNIQUE INDEX "member_org_user_uidx" ON "member" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opportunities_one_live_per_account_uidx" ON "opportunities" USING btree ("org_id","account_id") WHERE stage in ('Prospect', 'Plan reach-out', 'Reached out', 'In conversation', 'Meeting set', 'Proposal');--> statement-breakpoint
CREATE UNIQUE INDEX "signals_account_code_date_uidx" ON "signals" USING btree ("account_id","code","date");
