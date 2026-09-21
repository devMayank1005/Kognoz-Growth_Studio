"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, withOrg } from "@/db/client";
import { accounts, activities, dnc, opportunities, people } from "@/db/schema";
import { loadPartnerUserIds, loadPartnersByTower } from "@/db/queries";
import { isDoNotContact } from "@/domain/dnc";
import { industryOf } from "@/domain/industry";
import { practiceByName } from "@/domain/practices";
import { makeCard, VALUE_CAP, type EngineRow } from "@/domain/routing";
import { constantsMatch, MIGRATION_IN_PROGRESS } from "@/domain/money";
import { CONSTANTS_CURRENCY } from "@/domain/revenue";
import { loadMoneyView } from "@/lib/money-view";
import { permissionError, requireSession } from "@/lib/session";
import { queueZohoPush } from "@/lib/zoho/notify";

/**
 * Direct add (PRD §5) — the single path by which anything enters the pipeline.
 *
 * The chat action table, the quick-add box, and the `add {company}` intent all
 * come through here, so routing, valuation, DNC, and dedupe have exactly one
 * implementation and cannot drift apart.
 */

const rowSchema = z.object({
  // `.trim()` before `.min(1)`: a company of "   " passed min(1) and then became
  // an empty account name at the upsert below.
  company: z.string().trim().min(1),
  solution: z.string().optional(),
  contact_name: z.string().optional(),
  contact_title: z.string().optional(),
  country: z.string().optional(),
  industry: z.string().optional(),
  trigger: z.string().optional(),
  signal: z.string().optional(),
  // Capped, not just positive. `setCardValue` has always had a ceiling and this
  // path had none, so a crafted row carried a value the `integer` column cannot
  // hold and Postgres answered `integer out of range` — a 500, not a refusal.
  value: z.number().int().positive().max(VALUE_CAP).optional(),
  url: z.string().optional(),
});

export type AddCardResult =
  | { ok: true; id: string; account: string; practice: string; tower: string; partner: string; value: number; tier: string; stage: string }
  | { ok: false; reason: "dnc" | "duplicate" | "invalid" | "forbidden"; message: string };

const LIVE_STAGES = ["Prospect", "Plan reach-out", "Reached out", "In conversation", "Meeting set", "Proposal"] as const;

/**
 * The second argument is client input too.
 *
 * `input` has been zod-validated since this function was written; `options` was
 * typed and nothing more. A server action is a public endpoint, its TypeScript
 * signature is not a runtime check, and `stage` flowed through `makeCard`
 * verbatim into the insert. `opportunities.stage` is `text(..., { enum })`,
 * which Drizzle enforces only at compile time — there is no CHECK constraint in
 * any migration — so `addCard(row, { stage: "Won" })` stored a won card. That
 * lands in `closedValue` in the studio layout and in the $20M curve on the
 * dashboard: corrupted revenue reporting, no error, nothing in the audit log to
 * show what happened.
 *
 * `moveToStage` has always guarded its own stage argument (card-actions.ts).
 * This is the same guard, 240 lines away, finally applied.
 */
const optionsSchema = z
  .object({ stage: z.enum(["Prospect", "Plan reach-out"]).optional() })
  .optional();

export async function addCard(
  input: unknown,
  options?: { stage?: "Prospect" | "Plan reach-out" },
): Promise<AddCardResult> {
  const session = await requireSession();
  // Carries a reason because every other refusal here does: `action-table.tsx`
  // switches on it to decide whether the row is permanently blocked or merely
  // idle, and a refusal with no reason would have widened that union for every
  // caller.
  const denied = permissionError(session, "managePipeline");
  if (denied) return { ...denied, reason: "forbidden" as const };

  const money = await loadMoneyView(session.orgId);
  // The other write that prices a card. Same reason as `setCardValue`: during a
  // half-applied currency change, `makeCard` would default an unpriced card to
  // a constant of the wrong magnitude and store it permanently wrong.
  if (!constantsMatch(money.base, CONSTANTS_CURRENCY)) {
    return { ok: false, reason: "invalid", message: MIGRATION_IN_PROGRESS };
  }

  const parsed = rowSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, reason: "invalid", message: "That row is missing a company name." };
  }
  const parsedOptions = optionsSchema.safeParse(options);
  if (!parsedOptions.success) {
    // Deliberately not echoed back: the only way to reach this is a crafted
    // call, and a real caller cannot produce it.
    return { ok: false, reason: "invalid", message: "A card can only be added as Prospect or Plan reach-out." };
  }
  const row = parsed.data as EngineRow;
  const companyName = row.company.replace(/^NEW:\s*/, "").trim();

  // ------------------------------------------------------------------ DNC
  // §8: the do-not-contact list blocks add, draft, and packet. Checked before
  // anything is written. The comparison rule lives in domain/dnc.ts so the
  // same tested logic serves all three call sites.
  const dncList = await db
    .select({ name: dnc.name })
    .from(dnc)
    .where(eq(dnc.orgId, session.orgId));

  if (isDoNotContact(companyName, dncList.map((d) => d.name))) {
    return {
      ok: false,
      reason: "dnc",
      message: `${companyName} is on the do-not-contact list. It cannot be added, drafted to, or packeted.`,
    };
  }

  // -------------------------------------------------------------- account
  const [account] = await db
    .insert(accounts)
    .values({
      orgId: session.orgId,
      name: companyName,
      country: row.country || null,
      industry: row.industry || industryOf(row.industry),
      status: "discovered",
      firstSeen: new Date().toISOString().slice(0, 10),
    })
    .onConflictDoUpdate({
      target: [accounts.orgId, accounts.name],
      // Do not clobber a curated account's status or segment on re-add.
      set: { country: sql`coalesce(${accounts.country}, excluded.country)` },
    })
    .returning({ id: accounts.id });

  // ------------------------------------------------------------- dedupe
  // One live card per account (§5). A Won/Lost card does not block a new one.
  const existing = await db
    .select({ id: opportunities.id })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.orgId, session.orgId),
        eq(opportunities.accountId, account.id),
        inArray(opportunities.stage, [...LIVE_STAGES]),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      ok: false,
      reason: "duplicate",
      message: `${companyName} is already live in the pipeline.`,
    };
  }

  // ---------------------------------------------------------------- route
  const [partnerNames, partnerIds] = await Promise.all([
    loadPartnersByTower(session.orgId),
    loadPartnerUserIds(session.orgId),
  ]);

  const card = makeCard(row, {
    partnerOf: (tower) => partnerNames[tower],
    stage: parsedOptions.data?.stage ?? "Prospect",
  });

  // A named contact is only linked when we actually hold that person as a
  // verified record. Otherwise the target ROLE is stored — never a free-text
  // name pretending to be verified (§9.5).
  let contactPersonId: string | null = null;
  if (row.contact_name) {
    const [match] = await db
      .select({ id: people.id })
      .from(people)
      .where(and(eq(people.accountId, account.id), eq(people.name, row.contact_name)))
      .limit(1);
    contactPersonId = match?.id ?? null;
  }

  const practiceId = practiceByName(card.practice)?.id ?? "org";

  const inserted = await withOrg(session.orgId, async (tx) => {
    const [opp] = await tx
      .insert(opportunities)
      .values({
        orgId: session.orgId,
        accountId: account.id,
        practiceId,
        tower: card.tower,
        partnerUserId: partnerIds[card.tower],
        stage: card.stage,
        tier: card.tier,
        value: card.value,
        whale: card.whale,
        contactPersonId,
        contactRole: contactPersonId ? null : card.contact || row.contact_title || null,
        signalCode: card.signal || null,
        evidence: card.evidence || null,
        url: card.url || null,
        nextStep: card.next,
        dueOn: card.due || null,
        createdBy: session.userId,
      })
      .returning({ id: opportunities.id });

    // §5 — every add is on the activity timeline, with actor and time.
    await tx.insert(activities).values({
      orgId: session.orgId,
      opportunityId: opp.id,
      accountId: account.id,
      type: "added",
      payloadJson: {
        practice: card.practice,
        tower: card.tower,
        value: card.value,
        tier: card.tier,
        signal: card.signal,
      },
      actorId: session.userId,
    });

    return opp;
  });

  // Adding a card is the product's primary action, and until now it invalidated
  // nothing: the top bar, Pipeline, Today and Dashboard kept serving whatever
  // the router had cached, so the operator saw the write not happen. The shared
  // layout needs its own invalidation — soft navigation never refetches it.
  // After the write, never before: a worker that reads mid-transaction sees the
  // old row. Never throws — a queue outage must not fail the add (§12 #6).
  // `inserted.id`, NOT `card.id`. `makeCard` mints its own crypto.randomUUID()
  // which is never stored — the insert above lets Postgres generate the id and
  // returns it. Passing the card's id sent `pushCard` an id that exists nowhere,
  // so it answered "Card not found." and every add silently skipped its sync.
  // Invisible because zoho_dry_run defaults true: a dry run and a missing card
  // both write nothing.
  await queueZohoPush(session.orgId, inserted.id, "created");

  revalidatePath("/pipeline");
  revalidatePath("/today");
  revalidatePath("/dashboard");
  revalidatePath("/accounts");
  revalidatePath("/", "layout");

  return {
    ok: true,
    id: inserted.id,
    account: card.account,
    practice: card.practice,
    tower: card.tower,
    partner: card.partner,
    value: card.value,
    tier: card.tier,
    stage: card.stage,
  };
}
