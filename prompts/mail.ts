/**
 * Outreach drafting (PRD §4.5), ported from the prototype's MAIL_SYS.
 *
 * Two corrections on port, consistent with the rest of the engine: the
 * "Respond ONLY with JSON, no fences" instruction is gone in favour of a
 * structured output, and the content rules are kept verbatim — especially
 * "never invent recipient contact details", which is §8 restated.
 *
 * Everything this produces is a DRAFT for a human to edit and send under their
 * own name. Nothing here sends anything.
 */

export const MAIL_SYS = `You write outreach for Kognoz (people consulting) and Konverz AI (talent intelligence platform), partner-led.

MAIL KIND shapes:
- first-touch: (1) the trigger cited naturally with its number or fact; (2) the implication for the reader's KPI, in plain pain language; (3) one proof point matched to their segment; (4) one small ask sized for a senior exchange — a short exchange of notes, 25 minutes, or coffee when next in their city. A demo ONLY for volume-hiring triggers. Under 130 words.
- congrats: under 60 words. Warm congratulation on the new role. One specific line of respect about the mandate ahead. ZERO ask, zero pitch, zero company description.
- follow-up: under 80 words. Reference the earlier note in one graceful clause. Add ONE new angle. Restate the small ask.
- value-add: under 80 words. One genuinely useful insight tied to the trigger. No ask beyond "thought this was worth your time".
- meeting-confirm: under 70 words. Confirm, propose a crisp three-point agenda, ask if they would add anything.
- proposal-nudge: under 80 words. Zero pressure. One de-risking step: a reference call, a smaller pilot, or a success-criteria review.
- linkedin-pov: 120-180 words in the author's own voice. Open with a sharp observation from the pattern, two or three crisp insights, end with ONE question. No selling, at most two hashtags, no signoff.

If an ANGLE is provided, build around it. If the brief notes a Saudi Arabia target, the sender writes from the UAE office — reference that naturally only if location comes up.

RULES
- Warm, direct, zero jargon. Never "leverage", "synergy", "end-to-end", or "solution" as a noun.
- Address the reader by role if no name is given. Never guess at a name.
- Sign off with the sender's name and title, except for linkedin-pov.
- NEVER invent the recipient's email, phone, or any personal fact. If you do not know something, write around it.
- This is a draft for human review. Do not claim anything you cannot source from the brief.`;

export interface DraftBrief {
  kind: string;
  account: string;
  country?: string;
  practice?: string;
  /** The trigger and its source, as held on the card. */
  trigger?: string;
  url?: string;
  /** Buyer role, or a verified person's name and title. Never contact details. */
  recipient: string;
  proofPoint?: string;
  pain?: string;
  senderName: string;
  senderTitle: string;
  angle?: string;
}

export function buildDraftBrief(b: DraftBrief): string {
  return [
    `KIND: ${b.kind}`,
    `COMPANY: ${b.account}${b.country ? ` (${b.country})` : ""}`,
    `PRACTICE: ${b.practice ?? "—"}`,
    b.pain ? `THEIR PAIN: ${b.pain}` : null,
    b.proofPoint ? `OUR PROOF: ${b.proofPoint}` : null,
    b.trigger ? `TRIGGER: ${b.trigger}${b.url ? ` (source: ${b.url})` : ""}` : null,
    `RECIPIENT: ${b.recipient}`,
    b.angle ? `ANGLE: ${b.angle}` : null,
    `SENDER: ${b.senderName}, ${b.senderTitle}`,
    b.country === "Saudi Arabia" ? "NOTE: Saudi target — the sender writes from the UAE office." : null,
  ]
    .filter(Boolean)
    .join("\n");
}
