ALTER TABLE "settings" ADD COLUMN "base_currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fx_usd_inr" integer;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fx_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fx_source" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "fx_manual_override" boolean DEFAULT false NOT NULL;