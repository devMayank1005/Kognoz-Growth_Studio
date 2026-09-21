-- The audit trail survives the row it describes. PRD §8.
--
-- `activities.opportunity_id` and `.account_id` were both ON DELETE CASCADE since
-- 0000, so deleting an account or a card silently deleted the entries recording
-- what had been done to it. drizzle/0014 had to repoint four audit rows by hand
-- before deleting an account, and said why: "deleting the account first would take
-- four audit rows with it -- and PRD §8 requires the audit trail to survive."
--
-- Both columns were already nullable, so this is a constraint swap with no data
-- rewrite and no backfill.
--
-- SET NULL alone would not have been enough, and that is the part worth recording:
-- no payload writer carried the company name, so a nulled row would have survived
-- saying nothing about what it was about. The same change puts `account` into
-- `payload_json` at every write site, which drizzle/0013's activity_log view
-- already unwraps alongside `action`. Historical rows written before this keep
-- their ids and so keep their joins; only rows whose parent is deleted AFTER this
-- migration rely on the payload.
--
-- `org_id` stays ON DELETE CASCADE. Deleting an organisation is meant to take
-- everything, and there is no erasure path that does it today anyway.
--
-- Reversal: swap the two constraints back to `ON DELETE cascade`.

ALTER TABLE "activities" DROP CONSTRAINT "activities_opportunity_id_opportunities_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- The view has to survive the same delete.
--
-- `account` coalesced `acc.name, opp_acc.name` — both resolved by JOIN, so once
-- both foreign keys are nulled the column reads NULL even though the row is
-- intact and `detail` still carries the company. Adding `payload_json ->> 'account'`
-- as the last fallback means the view answers the question without the reader
-- having to know to look in `detail` instead. Verified: before the fallback, a
-- deleted account's surviving row showed `account` empty and the name only inside
-- `detail`.
create or replace view activity_log as
select
  to_char(a.at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as when_ist,
  coalesce(u.name, '(system)')                                    as actor,
  coalesce(a.payload_json ->> 'action', a.type)                   as action,
  coalesce(acc.name, opp_acc.name, a.payload_json ->> 'account')  as account,
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
  'company resolved through account_id, the card, or payload_json.account for '
  'rows whose parent has since been deleted, and `action` unwrapped from '
  'payload_json for the rows that store type = ''note''. '
  'Read-only, for browsing in the Neon console. No application code reads it.';
