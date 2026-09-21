"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db, withOrg } from "@/db/client";
import { activities, dnc, partnerTowers, settings, user } from "@/db/schema";
import { rateFromDecimal } from "@/domain/money";
import { TOWER_KEYS } from "@/domain/practices";
import { refreshFxRate, type FxUpdate } from "@/lib/fx";
import { permissionError, requireSession } from "@/lib/session";

/**
 * Settings (PRD §9.9). Admin-facing configuration.
 *
 * Note what is NOT here: the allowed email domains. Access control lives in the
 * environment on purpose — a control that can be widened from inside the app is
 * a privilege-escalation path (see src/domain/access.ts).
 */

const towerEnum = z.enum(TOWER_KEYS);

/**
 * Ceilings on the free text these actions store.
 *
 * All of it arrived from the browser unchecked: `.trim()` was called straight on
 * the argument, which throws on a non-string, and nothing capped the length of
 * values that go into `user.name` or into `activities.payload_json`.
 */
const nameSchema = z.string().trim().min(1).max(120);
const dncNameSchema = z.string().trim().min(1).max(200);
const dncReasonSchema = z.string().trim().max(500);

/**
 * Rename a tower's partner.
 *
 * This is why `partner_towers` exists: routing used to match the tower key
 * inside the partner's NAME, so the first rename would have silently broken
 * every packet and draft.
 */
export async function renamePartner(tower: string, name: string) {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;

  const parsedTower = towerEnum.safeParse(tower);
  // `.trim()` on the raw argument threw on anything that was not a string, and
  // the length was unbounded — this writes to the shared `user` row, which every
  // packet and draft carries.
  const parsedName = nameSchema.safeParse(name);
  if (!parsedTower.success) return { ok: false as const, message: "Unknown tower." };
  if (!parsedName.success) return { ok: false as const, message: "A partner needs a name." };
  const clean = parsedName.data;

  const [row] = await db
    .select({ userId: partnerTowers.userId })
    .from(partnerTowers)
    .where(and(eq(partnerTowers.orgId, session.orgId), eq(partnerTowers.tower, parsedTower.data)))
    .limit(1);

  if (!row) return { ok: false as const, message: "No partner is assigned to that tower yet." };

  /**
   * Scoped by the lookup above, not by a predicate here — `user` is Better
   * Auth's table and has no `org_id` to filter on.
   *
   * `row.userId` came from `partner_towers` filtered on this org, so only a
   * partner of this workspace can be renamed. That is the whole control, and it
   * is worth stating because the write itself looks unscoped: the name lives on
   * the shared identity row, so it changes everywhere that person appears. The
   * schema comment on `partner_towers` already notes this is the cost of not
   * touching Better Auth's tables.
   */
  await db.update(user).set({ name: clean, updatedAt: new Date() }).where(eq(user.id, row.userId));

  revalidatePath("/settings");
  revalidatePath("/pipeline");
  return { ok: true as const, name: clean };
}

const orgSettingsSchema = z.object({
  icpText: z.string().min(20, "The ICP needs enough detail for the engine to filter on."),
  radarMarkets: z.array(z.string().min(1)).max(12),
  dailyCallBudget: z.number().int().min(1).max(500),
});

export async function saveOrgSettings(input: unknown) {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;
  const parsed = orgSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Those settings are not valid." };
  }

  await db.update(settings).set(parsed.data).where(eq(settings.orgId, session.orgId));
  revalidatePath("/settings");
  return { ok: true as const };
}

/* ---------------------------------------------------------- currency (§5) */

/**
 * Which currency the interface renders in.
 *
 * Display only — no stored value moves, and the tier thresholds stay in the
 * base currency, so a core-sized card still routes as core whichever way this
 * is set.
 */
export async function saveDisplayCurrency(input: unknown) {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;
  const parsed = z.enum(["USD", "INR"]).safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Unknown currency." };

  await db
    .update(settings)
    .set({ displayCurrency: parsed.data })
    .where(eq(settings.orgId, session.orgId));

  // Every studio route renders money, so the whole segment is stale.
  revalidatePath("/", "layout");
  return { ok: true as const };
}

/* -------------------------------------------------------- the FX rate (§5) */

/**
 * The USD -> INR rate used when pushing amounts to a rupee CRM.
 *
 * Setting one by hand also sets `fxManualOverride`, which makes the daily fetch
 * SKIP. Without that, a rate typed in the morning would be silently replaced
 * overnight — which is precisely the failure an override exists to prevent.
 */
export async function saveFxRate(input: unknown) {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;

  const parsed = z
    .number()
    .positive("The rate must be greater than zero.")
    // A sanity band, not a forecast. A fat-fingered 8321 instead of 83.21
    // would understate every deal by 100x and look perfectly plausible in the
    // CRM, which is exactly the class of error this whole module exists for.
    .min(1, "That rate looks wrong — USD to INR is a number in the tens.")
    .max(1000, "That rate looks wrong — USD to INR is a number in the tens.")
    .safeParse(typeof input === "string" ? Number(input) : input);

  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Not a valid rate." };
  }

  /**
   * Audited, because this number prices every deal that reaches the CRM.
   *
   * It had no audit row at all. A rate typed here converts every Zoho Amount, and
   * setting one also silences the nightly fetch via `fxManualOverride` — so a
   * wrong figure persists until somebody notices, with nothing recording who set
   * it or when. `type: 'note'` with `payload_json.action` is the convention the
   * activity view already unwraps; the enum has no member for a settings change.
   */
  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(settings)
      .set({
        fxUsdInr: rateFromDecimal(parsed.data),
        fxUpdatedAt: new Date(),
        fxSource: "manual",
        fxManualOverride: true,
      })
      .where(eq(settings.orgId, session.orgId));

    await tx.insert(activities).values({
      orgId: session.orgId, type: "note",
      payloadJson: { action: "fx_rate_set", rate: parsed.data, source: "manual" },
      actorId: session.userId,
    });
  });

  revalidatePath("/settings");
  return { ok: true as const };
}

/** Hands the rate back to the daily fetch. The last manual value stays until
 *  the next fetch replaces it — clearing the override must not clear the rate. */
/**
 * Fetch today's rate.
 *
 * `refreshFxRate` and its keyless Frankfurter fetch have existed since the FX
 * work landed, with exactly one caller — the nightly sweep. There was no way
 * to correct a stale rate from the interface except to type one, and typing
 * one sets `fxManualOverride`, which silences the nightly fetch for good. So
 * the only manual repair available also broke the automatic one.
 */
export async function fetchFxRate(): Promise<
  { ok: true; status: FxUpdate["status"]; rate?: number } | { ok: false; message: string }
> {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;

  try {
    // Guarded like the sweep's `refresh-fx` step guards it: `refreshFxRate`
    // swallows a failed FETCH, but its two database writes are unguarded.
    const result = await refreshFxRate(session.orgId);
    revalidatePath("/settings");
    // The rate governs every screen when a conversion is in play.
    revalidatePath("/", "layout");
    return { ok: true, status: result.status, rate: result.rate };
  } catch (err) {
    console.error("[fx] manual refresh failed:", (err as Error).message);
    return { ok: false, message: "Could not reach the rate source. The stored rate is unchanged." };
  }
}

export async function clearFxOverride() {
  const session = await requireSession();
  const denied = permissionError(session, "manageSettings");
  if (denied) return denied;
  // Also audited: handing the rate back to the nightly fetch changes which
  // number prices the pipeline tomorrow.
  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(settings)
      .set({ fxManualOverride: false })
      .where(eq(settings.orgId, session.orgId));

    await tx.insert(activities).values({
      orgId: session.orgId, type: "note",
      payloadJson: { action: "fx_override_cleared" }, actorId: session.userId,
    });
  });
  revalidatePath("/settings");
  return { ok: true as const };
}

/* -------------------------------------------------------------- Zoho (§6) */

/**
 * The Zoho email dropbox address.
 *
 * `card-actions.ts` already reads this to BCC every "Open in mail" so activity
 * logs itself in the CRM (PRD §4.5) — but nothing has ever written it. Settings
 * had no field, the seed does not set it, and there is no other writer, so the
 * one piece of shipped Zoho behaviour has never once fired. This is the writer.
 *
 * A dropbox is a system mailbox, not a person, so §8 does not apply: it is the
 * same category as the company-published generic mailboxes §8 explicitly allows.
 */
export async function saveZohoBcc(input: unknown) {
  const session = await requireSession();
  const denied = permissionError(session, "manageIntegrations");
  if (denied) return denied;

  const parsed = z
    .string()
    .trim()
    .max(320)
    // Deliberately permissive beyond "has an @": Zoho dropbox addresses look
    // like `dropbox-xxxx@zohocrm.com` today and the format is theirs to change.
    // Refusing a valid address the operator pasted from Zoho would be worse
    // than accepting one that simply does not receive.
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "That does not look like an email address.",
    })
    .safeParse(input);

  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Not a valid address." };
  }

  // "" clears it, which is how the operator turns the BCC off.
  await db
    .update(settings)
    .set({ zohoBcc: parsed.data || null })
    .where(eq(settings.orgId, session.orgId));

  revalidatePath("/settings");
  return { ok: true as const };
}

/* --------------------------------------------------------------- DNC (§8) */

export async function addToDnc(name: string, reason: string) {
  const session = await requireSession();
  const denied = permissionError(session, "manageCompliance");
  if (denied) return denied;
  const parsedName = dncNameSchema.safeParse(name);
  const parsedReason = dncReasonSchema.safeParse(reason ?? "");
  if (!parsedName.success) return { ok: false as const, message: "Name required." };
  if (!parsedReason.success) return { ok: false as const, message: "That reason is too long." };
  const clean = parsedName.data;

  // One transaction: §8 wants an audit entry on every write, and this write
  // governs who the firm may contact. Committing the two separately meant a
  // failure between them could add a block with no record of who added it.
  await withOrg(session.orgId, async (tx) => {
    await tx
      .insert(dnc)
      .values({ id: randomUUID(), orgId: session.orgId, name: clean, kind: "company", reason: parsedReason.data || null, addedBy: session.userId })
      .onConflictDoNothing({ target: [dnc.orgId, dnc.name] });

    await tx.insert(activities).values({
      orgId: session.orgId, type: "note",
      payloadJson: { action: "dnc_added", name: clean, reason: parsedReason.data }, actorId: session.userId,
    });
  });

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function removeFromDnc(name: string) {
  const session = await requireSession();
  const denied = permissionError(session, "manageCompliance");
  if (denied) return denied;
  const parsedName = dncNameSchema.safeParse(name);
  if (!parsedName.success) return { ok: false as const, message: "Name required." };
  const clean = parsedName.data;
  /**
   * The dangerous direction, and the one that most needed a transaction.
   *
   * The delete is not reversible, and losing the audit row destroys the only
   * record of who un-blocked a company — after which the §8 gate correctly lets
   * the next add, draft and packet through for a company somebody decided not to
   * contact.
   */
  await withOrg(session.orgId, async (tx) => {
    await tx.delete(dnc).where(and(eq(dnc.orgId, session.orgId), eq(dnc.name, clean)));

    await tx.insert(activities).values({
      orgId: session.orgId, type: "note",
      payloadJson: { action: "dnc_removed", name: clean }, actorId: session.userId,
    });
  });

  revalidatePath("/settings");
  return { ok: true as const };
}
