-- The audit trail, readable.
--
-- PRD §8 requires an entry on every write and `activities` has one, but the
-- table cannot be read directly: the actor is a Better Auth id, the company is
-- one or two joins away depending on whether the row carries `account_id` or
-- only `opportunity_id`, and `type` is a catch-all.
--
-- That last one is the reason this exists rather than being a saved query.
-- Stage moves, DNC additions and removals, and the 0011/0012 re-denomination
-- all store `type = 'note'` and put the real verb in `payload_json.action`, so
-- filtering the table by `type` never finds a stage change. `action` below
-- unwraps that; `raw_type` keeps the stored value so nothing is hidden.
--
-- A VIEW, not a table: always live, no sync job, and it cannot drift from
-- `activities`. It is here as a migration rather than created by hand in the
-- console because a hand-made view survives only until the next restore, and
-- the region move in docs/CLAIM-NEON.md is a pg_restore.
--
-- NO COLUMN MAY BE NAMED email/phone/mobile/address/linkedin/twitter/whatsapp.
-- scripts/check-compliance.mjs greps information_schema.columns, which INCLUDES
-- VIEWS, and exempts only the seven Better Auth table names — so an
-- `actor_email` here would fail the §8 check, correctly. The actor is resolved
-- to a name, which is what makes the log readable anyway.

create or replace view activity_log as
select
  to_char(a.at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as when_ist,
  coalesce(u.name, '(system)')                                    as actor,
  coalesce(a.payload_json ->> 'action', a.type)                   as action,
  coalesce(acc.name, opp_acc.name)                                as account,
  o.tower                                                         as tower,
  a.payload_json                                                  as detail,
  a.type                                                          as raw_type,
  a.at                                                            as at,
  a.org_id                                                        as org_id,
  a.opportunity_id                                                as opportunity_id,
  a.id                                                            as id
from activities a
-- Every join is a LEFT join deliberately. `actor_id` is ON DELETE SET NULL, and
-- the two re-denomination entries were written by a migration with no actor at
-- all; an inner join would silently drop exactly the rows an audit log exists
-- to preserve.
left join "user"        u       on u.id       = a.actor_id
left join accounts      acc     on acc.id     = a.account_id
left join opportunities o       on o.id       = a.opportunity_id
left join accounts      opp_acc on opp_acc.id = o.account_id
order by a.at desc;
--> statement-breakpoint
comment on view activity_log is
  'Readable form of activities (PRD §8 audit trail): actor resolved to a name, '
  'company resolved through either account_id or the card, and `action` '
  'unwrapped from payload_json for the rows that store type = ''note''. '
  'Read-only, for browsing in the Neon console. No application code reads it.';
