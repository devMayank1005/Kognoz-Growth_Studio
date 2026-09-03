CREATE TABLE "auth_errors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"path" text,
	"code" text,
	"message" text
);
--> statement-breakpoint
CREATE INDEX "auth_errors_at_idx" ON "auth_errors" USING btree ("at");