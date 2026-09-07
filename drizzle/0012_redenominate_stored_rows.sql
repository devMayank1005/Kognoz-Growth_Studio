-- The other place amounts are stored: action-table rows inside conversations.
--
-- 0011 moved `opportunities.value` and left these behind. They are not a
-- transcript detail — each row renders with a live "＋ Add" button, so a stale
-- row is a button that silently creates a card at a hundredth of its worth.
-- All 546 of them held the old core value.
--
-- ONLY `rows[].value`. `chart.data[].value` in the same documents counts
-- triggers per market (42, 19, 13), and multiplying those would turn a bar
-- chart of counts into nonsense. Prose is left exactly as written: it is a
-- record of what was said, and it was true when it was said.

--> statement-breakpoint
INSERT INTO activities (org_id, type, payload_json, actor_id)
SELECT DISTINCT c.org_id, 'note',
  jsonb_build_object('action', 'redenominated_conversation_rows', 'rate', 100, 'migration', '0012'),
  NULL
FROM conversations c
WHERE c.messages_json @? '$[*].rows[*].value';

--> statement-breakpoint
UPDATE conversations
SET messages_json = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN jsonb_typeof(turn->'rows') = 'array'
      THEN jsonb_set(turn, '{rows}', (
        SELECT COALESCE(jsonb_agg(
          CASE WHEN jsonb_typeof(r->'value') = 'number'
            THEN jsonb_set(r, '{value}', to_jsonb(((r->>'value')::numeric * 100)::bigint))
            ELSE r
          END
          ORDER BY ord2
        ), '[]'::jsonb)
        FROM jsonb_array_elements(turn->'rows') WITH ORDINALITY AS e2(r, ord2)
      ))
      ELSE turn
    END
    ORDER BY ord
  ), '[]'::jsonb)
  FROM jsonb_array_elements(messages_json) WITH ORDINALITY AS e(turn, ord)
)
WHERE messages_json @? '$[*].rows[*].value';
