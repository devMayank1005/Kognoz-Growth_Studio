/**
 * What the Zoho mapper is allowed to know.
 *
 * There is no email, phone, or address field on `SyncCard`, and there must
 * never be one — the same structural rule the `people` table uses (PRD §8,
 * `src/db/schema/app.ts`). A mapper cannot leak what it cannot be handed, so
 * the compliance boundary starts with this type rather than with a check.
 */

import type { Stage } from "../routing";
import type { ZohoDealStage } from "./stage";

export interface SyncCard {
  id: string;
  account: string;
  country: string;
  industry: string;
  practiceId: string;
  practiceName: string;
  tower: string;
  /** Partner display name, already resolved from partnerTowers ⋈ user. */
  partner: string;
  stage: Stage;
  /** USD. See the plan's open question 6 — a non-USD Zoho org corrupts this. */
  value: number;
  /** YYYY-MM-DD, or "" for none. */
  dueOn: string;
  nextStep: string;
  evidence: string;
  signalCode: string;
  url: string;
  /** A VERIFIED person only (a `people` row). Null when we hold only a role. */
  contact: { name: string; title: string } | null;
  /** The role we are aiming at. Never a name, never a guess (PRD §9.5). */
  contactRole: string;
  zohoLeadId: string | null;
  zohoDealId: string | null;
  zohoAccountId: string | null;
  zohoContactId: string | null;
}

export interface ZohoLeadPayload {
  Company: string;
  Last_Name: string;
  First_Name?: string;
  Designation?: string;
  Country?: string;
  Industry?: string;
  Lead_Source: string;
  Description: string;
}

export interface ZohoDealPayload {
  Deal_Name: string;
  /** An id we wrote, never a bare name — see the "only writes what it created"
   *  invariant. Absent until the account has been upserted. */
  Account_Name?: { id: string };
  Stage: ZohoDealStage;
  Amount: number;
  /** YYYY-MM-DD. */
  Closing_Date: string;
  /** Only when a verified person exists AND has been pushed. */
  Contact_Name?: { id: string };
  Next_Step?: string;
  Description: string;
  Lead_Source: string;
}

/** The four fields the reconcile is permitted to bring back. */
export interface PulledDeal {
  id: string;
  stage: string;
  amount: number | null;
  modifiedTime: string;
}
