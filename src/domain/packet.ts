/**
 * The partner packet (PRD §5).
 *
 * Plain text on purpose: a partner pastes this into WhatsApp or their own mail
 * client. Ported from the prototype's buildPacket.
 *
 * Every packet carries the trigger AND its source. A claim without a source is
 * not evidence, and the partner is about to put their name to it.
 */

import { TOWERS } from "./practices";
import type { TowerKey } from "./revenue";

export interface PacketCard {
  account: string;
  country?: string;
  tower: TowerKey;
  partner?: string;
  practice?: string;
  value?: number;
  tier?: string;
  whale?: boolean;
  evidence?: string;
  url?: string;
  /** The door: a verified person's role, or empty. Never a contact detail. */
  contact?: string;
}

export interface PacketOptions {
  today: string;
  warmPath?: string;
  draft?: { subject: string; body: string };
}

const fmtK = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

export function buildPacket(card: PacketCard, options: PacketOptions): string {
  const tower = TOWERS[card.tower];

  return [
    `OPPORTUNITY — ${card.account}${card.country ? ` (${card.country})` : ""}`,
    `Tower: ${tower?.label ?? card.tower} → ${card.partner || "unassigned"}`,
    `Value (working): ${card.value ? fmtK(card.value) : "—"} · ${card.tier ?? "core"}${card.whale ? " · WHALE" : ""}`,
    card.evidence ? `Trigger: ${card.evidence}${card.url ? ` (${card.url})` : ""}` : null,
    card.practice && card.practice !== "TBD" ? `Take them: ${card.practice}` : null,
    card.contact ? `Door: ${card.contact}` : "Door: to be found — LinkedIn or official channels",
    options.warmPath ? `Warm path: ${options.warmPath}` : null,
    options.draft
      ? `\nDRAFT (plain text, edit before sending):\nSubject: ${options.draft.subject}\n\n${options.draft.body}`
      : null,
    // The partner is accountable for what they send under their own name.
    `\n— Growth Engine · ${options.today} · verify before acting`,
  ]
    .filter(Boolean)
    .join("\n");
}
