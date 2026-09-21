CREATE TABLE "zoho_push_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"module" text NOT NULL,
	"key" text NOT NULL,
	"sent_at" timestamp with time zone,
	"remote_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zoho_push_attempts" ADD CONSTRAINT "zoho_push_attempts_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoho_push_attempts" ADD CONSTRAINT "zoho_push_attempts_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "zoho_push_attempts_key_uidx" ON "zoho_push_attempts" USING btree ("opportunity_id","module","key");--> statement-breakpoint
CREATE INDEX "zoho_push_attempts_org_idx" ON "zoho_push_attempts" USING btree ("org_id","created_at");--> statement-breakpoint
-- Same reasoning as 0015: `text("module", { enum })` is a compile-time type and
-- nothing more. src/db/schema/enum-checks.test.ts scans every migration for
-- these, so a new enum column without one fails a test rather than shipping.
ALTER TABLE "zoho_push_attempts" ADD CONSTRAINT "zoho_push_attempts_module_check" CHECK ("module" IN ('Leads', 'Deals'));
