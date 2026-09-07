ALTER TABLE "sweep_runs" ADD COLUMN "dropped" text;--> statement-breakpoint
ALTER TABLE "sweep_runs" ADD COLUMN "web_search_degraded" boolean DEFAULT false NOT NULL;