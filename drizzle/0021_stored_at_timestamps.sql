-- When a finding and a person were STORED, as distinct from when the news happened.
--
-- `signals` had only `date` (the news date) and `people` only `verified_at` (when
-- a human confirmed the person, and nullable). Neither answers "when did this
-- enter the database", and `drizzle/0016` had to work around the absence to
-- de-duplicate: it ordered on `sweep_runs.started_at` because ids here are
-- `gen_random_uuid()` and carry no time at all.
--
-- NOT the one-liner drizzle-kit generates. `ADD COLUMN created_at timestamptz
-- DEFAULT now() NOT NULL` stamps every historical row with the migration's own
-- timestamp, which destroys the exact ordering 0016 needed and replaces "unknown"
-- with a confident wrong answer. Three steps -- nullable, backfill, then default
-- and NOT NULL -- is the only version that keeps the history.
--
-- Backfill sources, best evidence first:
--   signals  the started_at of the sweep that found it. `sweep_id` is ON DELETE
--            SET NULL and the seed writes no sweep at all, so the remainder falls
--            back to `date` -- the news date, which for those rows is the closest
--            honest approximation and is never later than storage.
--   people   `verified_at` where present, else now(). There is no better source;
--            the rows without it were seeded.
--
-- Reversal: ALTER TABLE ... DROP COLUMN created_at. Dropping loses the backfilled
-- history, so take a dump first (scripts/backup.mjs --verify).

--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "created_at" timestamp with time zone;

--> statement-breakpoint
ALTER TABLE "people" ADD COLUMN "created_at" timestamp with time zone;

--> statement-breakpoint
-- Best evidence: the sweep that produced the finding.
UPDATE signals s
SET created_at = r.started_at
FROM sweep_runs r
WHERE r.id = s.sweep_id AND s.created_at IS NULL;

--> statement-breakpoint
-- The remainder: seeded fixtures, and findings whose sweep row has been removed.
-- `date` is a DATE, so this lands at midnight UTC of the news day.
UPDATE signals SET created_at = date::timestamptz WHERE created_at IS NULL;

--> statement-breakpoint
UPDATE people SET created_at = coalesce(verified_at, now()) WHERE created_at IS NULL;

--> statement-breakpoint
-- §8 wants an entry for every write, and a backfill is a write. Recorded the way
-- 0011 and 0016 record theirs: the counts, so the result is checkable later.
INSERT INTO activities (org_id, type, payload_json, actor_id)
SELECT
  o.id,
  'note',
  jsonb_build_object(
    'action', 'backfilled_created_at',
    'migration', '0021',
    'signals_from_sweep', (SELECT count(*) FROM signals WHERE sweep_id IS NOT NULL),
    'signals_from_news_date', (SELECT count(*) FROM signals WHERE sweep_id IS NULL),
    'people', (SELECT count(*) FROM people)
  ),
  NULL
FROM organization o;

--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "created_at" SET DEFAULT now();

--> statement-breakpoint
ALTER TABLE "signals" ALTER COLUMN "created_at" SET NOT NULL;

--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "created_at" SET DEFAULT now();

--> statement-breakpoint
ALTER TABLE "people" ALTER COLUMN "created_at" SET NOT NULL;
