import { practiceById } from "@/domain/practices";
import type { Stage } from "@/domain/routing";
import type { SyncCard } from "@/domain/zoho/types";
import type { PipelineCardRow } from "@/db/queries";

/**
 * Pipeline row → the mapper's input.
 *
 * This adapter lives in `lib`, not `domain`, on purpose: `src/domain/` may not
 * import from `db`, and `PipelineCardRow` is a database-shaped type. Keeping
 * the seam here is what lets the mapper stay pure and unit-testable without a
 * database.
 */
export function toSyncCard(row: PipelineCardRow): SyncCard {
  return {
    id: row.id,
    account: row.account,
    country: row.country,
    industry: row.industry,
    practiceId: row.practiceId,
    practiceName: practiceById(row.practiceId)?.name ?? row.practiceId,
    tower: row.tower,
    partner: row.partner,
    stage: row.stage as Stage,
    value: row.value,
    dueOn: row.due,
    nextStep: row.next,
    evidence: row.evidence,
    signalCode: row.signal,
    url: row.url,
    // A verified person or nothing. `contactRole` is the role we are aiming at
    // and must never be promoted into a name (PRD §9.5).
    contact: row.contactName ? { name: row.contactName, title: row.contactTitle } : null,
    contactRole: row.contactRole,
    // Written by the sync engine when it lands; always null for now, which is
    // why the CSV names the account rather than referencing an id.
    zohoLeadId: null,
    zohoDealId: null,
    zohoAccountId: null,
    zohoContactId: null,
  };
}
