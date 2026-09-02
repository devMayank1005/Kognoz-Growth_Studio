CREATE TABLE "partner_towers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tower" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partner_towers" ADD CONSTRAINT "partner_towers_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_towers" ADD CONSTRAINT "partner_towers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_towers_org_tower_idx" ON "partner_towers" USING btree ("org_id","tower");