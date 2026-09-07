-- Re-denominate the programme from USD to INR at a frozen rate of ₹100.
--
-- One transaction, because the three facts it changes must never be observed
-- apart: an amount, the currency it is in, and the tier derived from it. A card
-- holding rupees while `base_currency` still says USD is a card the application
-- will price with dollar-magnitude thresholds — an invisible 100x error.
--
-- The rate is ₹100 and not a market rate on purpose. It is a planning rate,
-- frozen once and never re-read, so the constants in `src/domain/revenue.ts`
-- and `src/domain/routing.ts` are literals that can never drift. See
-- `REDENOMINATION` there; this file and that constant must agree.
--
-- REVERSAL: restore from the pre-migration dump, or from a Neon branch taken
-- before the timestamp on the audit row this writes. The inverse UPDATE is a
-- last resort only — dividing back is not exact in general, which is why the
-- audit row carries every row's before and after value.

--> statement-breakpoint
-- Blocks a concurrent insert, which `SELECT ... FOR UPDATE` would not.
LOCK TABLE opportunities IN SHARE ROW EXCLUSIVE MODE;

--> statement-breakpoint
-- The audit row first, capturing the before state while it is still true.
-- §8 wants an entry for every write; this is the largest write the product
-- will ever make, and the snapshot is also the exact reversal record.
INSERT INTO activities (org_id, type, payload_json, actor_id)
SELECT
  o.org_id,
  'note',
  jsonb_build_object(
    'action', 'redenominated',
    'from', 'USD',
    'to', 'INR',
    'rate', 100,
    'migration', '0011',
    'rows', jsonb_agg(
      jsonb_build_object('id', o.id, 'before', o.value, 'after', o.value * 100, 'tier', o.tier)
      ORDER BY o.id
    )
  ),
  NULL
FROM opportunities o
GROUP BY o.org_id;

--> statement-breakpoint
-- The amounts, and the tier and whale flag derived from them. `tier` and
-- `whale` are STORED columns, not computed on read, so leaving them behind
-- would leave the stored tier disagreeing with the new floors.
UPDATE opportunities
SET
  value = value * 100,
  tier = CASE
    WHEN value * 100 >= 50000000 THEN 'whale'   -- WHALE_FLOOR ₹5Cr
    WHEN value * 100 >= 25000000 THEN 'core'    -- CORE_FLOOR  ₹2.5Cr
    ELSE 'wedge'
  END,
  whale = (value * 100) >= 50000000;

--> statement-breakpoint
-- Both, deliberately. `display_currency` was left on USD by a click in
-- Settings; without this line the whole migration lands back on dollar screens.
UPDATE settings SET base_currency = 'INR', display_currency = 'INR';
