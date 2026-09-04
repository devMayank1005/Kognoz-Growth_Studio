CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'chat' NOT NULL,
	"messages_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversations_owner_idx" ON "conversations" USING btree ("org_id","user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_brief_idx" ON "conversations" USING btree ("org_id","user_id") WHERE kind = 'brief';--> statement-breakpoint
-- Carry every existing thread across as a conversation.
--
-- One thread row becomes one conversation, titled from its first user turn.
-- Nothing is dropped and nothing is split: `messages_json` moves whole, so a
-- turn that was reachable before is reachable after. `threads` is deliberately
-- left in place and untouched, which is what makes this reversible — dropping
-- it is a separate step once the new table has been lived with.
--
-- Existing brief turns stay inside the migrated conversation rather than being
-- extracted into a `kind='brief'` one. Splitting them would mean rewriting
-- history on a guess; the next brief creates the pinned conversation instead.
INSERT INTO "conversations" ("org_id", "user_id", "title", "kind", "messages_json", "created_at", "updated_at")
SELECT
  t."org_id",
  t."user_id",
  COALESCE(
    (
      SELECT
        CASE
          WHEN length(btrim(e->>'text')) > 60 THEN left(btrim(e->>'text'), 57) || '…'
          ELSE btrim(e->>'text')
        END
      FROM jsonb_array_elements(t."messages_json") AS e
      WHERE e->>'role' = 'user'
        AND btrim(COALESCE(e->>'text', '')) <> ''
      LIMIT 1
    ),
    'Earlier chat'
  ),
  'chat',
  t."messages_json",
  t."updated_at",
  t."updated_at"
FROM "threads" t
WHERE jsonb_typeof(t."messages_json") = 'array';
