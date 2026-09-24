ALTER TABLE "settings" ADD COLUMN "daily_sweep_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Existing orgs start paused: the schedule was switched off on request. New orgs default to on (PRD §4.1).
UPDATE "settings" SET "daily_sweep_enabled" = false;
