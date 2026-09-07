ALTER TABLE "opportunities" ADD COLUMN "zoho_modified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "zoho_sync_error" text;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "zoho_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "zoho_sync_attempts" integer DEFAULT 0 NOT NULL;