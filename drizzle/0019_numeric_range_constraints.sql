-- Ranges the database will refuse, for columns where TypeScript was the only guard.
--
-- 0015 constrained the text-enum columns. These are the numeric ones, and one of
-- them was not merely unconstrained but actively broken:
--
--   `opportunities.value` is `integer` -- int4, ceiling 2,147,483,647 -- while
--   `VALUE_CAP` in src/domain/routing.ts was 10,000,000,000. A value near ₹300Cr
--   passed `setCardValue`'s cap, passed `addCard`'s `z.number().int().positive()`
--   (which had no cap at all), and reached Postgres as `integer out of range`.
--   An unhandled 500, from the exact guard written to produce a refusal.
--
--   The column is not widened to bigint, deliberately. `PROGRAM_TARGET` is
--   2,000,000,000 -- ₹200Cr, the entire 18-month commitment -- so no single deal
--   can legitimately exceed it, int4 holds it with headroom, and rewriting a hot
--   column to carry a number that cannot occur would be the wrong trade.
--   `VALUE_CAP` is now `PROGRAM_TARGET`; this constraint carries the same number.
--
-- Written as BETWEEN, not IN, and named `_range_check` rather than `_check`, for
-- a specific reason: src/db/schema/enum-checks.test.ts parses every migration for
-- `CHECK ("col" IN (...))` and asserts that nothing outside the schema's enum
-- columns is constrained. `CHECK ("tier" IN (1,2,3))` would be matched, `tier` is
-- an integer and not an enum column, and two tests would go red. The comparison
-- form stays outside that namespace on purpose.
--
-- Also deliberately NOT expressed with Drizzle's `check()` in the TS schema: the
-- 0015 and 0017 constraints are absent from every snapshot, so the next
-- `drizzle-kit generate` would emit an ADD CONSTRAINT for something that already
-- exists. Hand-written migration, as 0015 is.
--
-- Verified satisfiable against the seeded database before writing: tier 1..2,
-- confidence 0..0, value 5,000,000, mix_new_ratio 70.
--
-- Reversal: ALTER TABLE <t> DROP CONSTRAINT <name>. Nothing is rewritten.

--> statement-breakpoint
-- src/domain/signals.ts: `export type Tier = 1 | 2 | 3`, and all 27 catalogue
-- entries are 1, 2 or 3. `tierWeight` silently collapses anything else to 8.
ALTER TABLE "signals" ADD CONSTRAINT "signals_tier_range_check" CHECK ("tier" BETWEEN 1 AND 3);

--> statement-breakpoint
-- src/engine/sweep-schema.ts: CONFIDENCE_SCORE = {high:90, medium:60, low:30};
-- the seed writes 0 for unsourced fixtures. Bounded as a percentage rather than
-- to the four literals, so a future scoring change does not need a migration.
ALTER TABLE "signals" ADD CONSTRAINT "signals_confidence_range_check" CHECK ("confidence" BETWEEN 0 AND 100);

--> statement-breakpoint
-- The int4 overflow described above. 2,000,000,000 = PROGRAM_TARGET = ₹200Cr.
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_value_range_check" CHECK ("value" BETWEEN 0 AND 2000000000);

--> statement-breakpoint
-- Stored as a PERCENTAGE (70), not the ratio 0.70 its schema comment claimed.
-- The column has zero readers today; bounding it is cheaper than dropping it,
-- since there are no down-migrations here and a drop cannot be undone.
ALTER TABLE "settings" ADD CONSTRAINT "settings_mix_new_ratio_range_check" CHECK ("mix_new_ratio" BETWEEN 0 AND 100);
