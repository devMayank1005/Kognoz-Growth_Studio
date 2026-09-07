CREATE TABLE "zoho_connections" (
	"org_id" text PRIMARY KEY NOT NULL,
	"dc" text NOT NULL,
	"accounts_domain" text NOT NULL,
	"api_domain" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text NOT NULL,
	"zoho_org_id" text,
	"zoho_org_name" text,
	"zoho_currency" text,
	"connected_by_user_id" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refresh_at" timestamp with time zone,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"refresh_failures" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "zoho_connections" ADD CONSTRAINT "zoho_connections_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zoho_connections" ADD CONSTRAINT "zoho_connections_connected_by_user_id_user_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;