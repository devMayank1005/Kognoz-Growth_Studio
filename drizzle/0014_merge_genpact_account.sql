-- Merge the account created by a mis-parse back into the real one.
--
-- `add Genpact in this` was typed into the chat composer. The add intent takes
-- everything not consumed by `for`/`at` as the company name, so it created an
-- account literally called "Genpact in this" — status `discovered`, no country —
-- alongside the seeded client account "Genpact". The unique index is on the exact
-- string, so nothing collided and nothing complained.
--
-- The card it produced is also mis-routed (practice `org`, tower T1) because the
-- same mis-parse fed `practiceByName` a solution it could not resolve. That is
-- NOT corrected here: which practice was meant is not recoverable from the data,
-- and guessing would be a silent re-route. Set it in the inspector.
--
-- Order matters. `activities.account_id` is ON DELETE CASCADE, so deleting the
-- account first would take four audit rows with it — and PRD §8 requires the
-- audit trail to survive. Repoint every reference, then delete.
--
-- Written as a targeted merge rather than a general one because it is a
-- one-off repair of known rows; the durable fix is confirming the parse before
-- the write, which is application work, not a migration.

DO $$
DECLARE
  stray_id uuid;
  real_id  uuid;
  org      text;
  moved_cards      int;
  moved_activities int;
BEGIN
  SELECT id, org_id INTO stray_id, org FROM accounts WHERE name = 'Genpact in this';
  SELECT id        INTO real_id       FROM accounts WHERE name = 'Genpact';

  -- Idempotent: if the stray is already gone, or the real account never existed
  -- (a database seeded differently), do nothing rather than guess.
  IF stray_id IS NULL OR real_id IS NULL THEN
    RAISE NOTICE 'merge skipped: stray=% real=%', stray_id, real_id;
    RETURN;
  END IF;

  UPDATE opportunities SET account_id = real_id WHERE account_id = stray_id;
  GET DIAGNOSTICS moved_cards = ROW_COUNT;

  UPDATE activities    SET account_id = real_id WHERE account_id = stray_id;
  GET DIAGNOSTICS moved_activities = ROW_COUNT;

  -- The merge is itself a write, so it gets its own audit row (§8), recording
  -- what was absorbed and what it took with it.
  INSERT INTO activities (org_id, account_id, type, payload_json, actor_id, at)
  VALUES (
    org, real_id, 'note',
    jsonb_build_object(
      'action', 'account_merged',
      'from', 'Genpact in this',
      'into', 'Genpact',
      'cards_moved', moved_cards,
      'activities_moved', moved_activities,
      'cause', 'chat add-intent parsed the trailing phrase as part of the company name',
      'migration', '0014'
    ),
    NULL, now()
  );

  DELETE FROM accounts WHERE id = stray_id;
END $$;
