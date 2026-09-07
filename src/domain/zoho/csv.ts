/**
 * The CSV fallback (PRD §6: "CSV export (Leads + Deals files) remains
 * available", and §14's launch bridge before the API sync lands).
 *
 * Built on the SAME payload builders as the API path, not a parallel set of
 * field expressions. The prototype had its Lead Source and column mapping typed
 * out separately in four places; one shared definition is what stops the export
 * and the API writing different things into the same CRM.
 */

import { LEAD_SOURCE, NO_NAMED_CONTACT } from "./fields";
import type { Currency } from "../money";
import { toDeal, toLead, zohoTargetFor } from "./to-zoho";
import type { SyncCard } from "./types";

/** Zoho's import columns. Order is the contract — a reordered file misimports. */
export const LEAD_COLUMNS = [
  "First Name", "Last Name", "Designation", "Company",
  "Country", "Industry", "Lead Status", "Lead Source", "Description",
] as const;

export const DEAL_COLUMNS = [
  "Deal Name", "Account Name", "Stage", "Amount",
  "Closing Date", "Contact Name", "Next Step", "Description", "Lead Source",
] as const;

/** Zoho's own default for a lead nobody has approached yet. */
const LEAD_STATUS = "Not Contacted";

/**
 * RFC 4180. A company name containing a comma, a quote or a newline is not
 * hypothetical — "Aldar Properties, PJSC" is exactly the shape of the data.
 */
function cell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (cells: (string | number)[]): string => cells.map(cell).join(",");

/** CRLF and a trailing newline: Excel on Windows is where these get opened. */
function file(header: readonly string[], rows: string[]): string {
  return [row([...header]), ...rows].join("\r\n") + "\r\n";
}

export function leadsCsv(
  cards: readonly SyncCard[],
  leadSource = LEAD_SOURCE,
  currency: Currency = "USD",
): string {
  const rows = cards.map((card) => {
    const lead = toLead(card, leadSource, currency);
    return row([
      lead.First_Name ?? "",
      // The placeholder is carried through rather than blanked: Zoho rejects an
      // empty Last Name on import, and a blank row is worse than a labelled one.
      lead.Last_Name || NO_NAMED_CONTACT,
      lead.Designation ?? "",
      lead.Company,
      lead.Country ?? "",
      lead.Industry ?? "",
      LEAD_STATUS,
      lead.Lead_Source,
      lead.Description,
    ]);
  });
  return file(LEAD_COLUMNS, rows);
}

export function dealsCsv(
  cards: readonly SyncCard[],
  today: Date,
  leadSource = LEAD_SOURCE,
): string {
  const rows = cards.map((card) => {
    const deal = toDeal(card, today, leadSource);
    return row([
      deal.Deal_Name,
      // The CSV names the account, where the API sends an id. An import file
      // has no ids to send — this is the one place they legitimately differ.
      card.account,
      deal.Stage,
      deal.Amount,
      deal.Closing_Date,
      card.contact?.name ?? "",
      deal.Next_Step ?? "",
      deal.Description,
      deal.Lead_Source,
    ]);
  });
  return file(DEAL_COLUMNS, rows);
}

/** PRD §3: Prospect exports as a Lead, everything past it as a Deal. */
export function splitForExport(cards: readonly SyncCard[]): {
  leads: SyncCard[];
  deals: SyncCard[];
} {
  const leads: SyncCard[] = [];
  const deals: SyncCard[] = [];
  for (const card of cards) {
    (zohoTargetFor(card.stage) === "lead" ? leads : deals).push(card);
  }
  return { leads, deals };
}
