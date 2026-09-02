import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { MAIL_SYS, buildDraftBrief, type DraftBrief } from "../../prompts/mail";
import { PROSE_MODEL, client, readUsage, type UsageReport } from "./client";

/**
 * Draft generation (PRD §4.5).
 *
 * No web search: everything the note needs is already on the card, and a draft
 * that goes looking for fresh facts is a draft that can invent them.
 */

export const draftSchema = z.object({
  subject: z.string().describe("Max 9 words, specific. For linkedin-pov, a 5-8 word hook line."),
  body: z.string().describe("Plain text with line breaks"),
});

export type Draft = z.infer<typeof draftSchema>;

/** Same guard as everywhere else: nothing carrying a contact detail is stored. */
const CONTACT_SHAPED = /[\w.+-]+@[\w-]+\.[\w.]+|(?:\+|00)\d[\d\s().-]{6,}/g;

export async function writeDraft(brief: DraftBrief): Promise<{ draft: Draft; usage: UsageReport }> {
  const response = await client.messages.parse({
    model: PROSE_MODEL,
    max_tokens: 2_000,
    system: [{ type: "text", text: MAIL_SYS, cache_control: { type: "ephemeral", ttl: "1h" } }],
    messages: [{ role: "user", content: buildDraftBrief(brief) }],
    output_config: { format: zodOutputFormat(draftSchema), effort: "medium" },
  });

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("draft generation returned no parseable output");

  return {
    draft: {
      subject: parsed.subject.replace(CONTACT_SHAPED, "").trim(),
      // The sender's own signature is theirs to add in their mail client; a
      // model-invented address must never reach a real recipient.
      body: parsed.body.replace(CONTACT_SHAPED, "").trim(),
    },
    usage: readUsage(response.usage),
  };
}
