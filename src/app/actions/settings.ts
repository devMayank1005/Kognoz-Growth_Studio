"use server";

import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import { activities, dnc, partnerTowers, settings, user } from "@/db/schema";
import { TOWER_KEYS } from "@/domain/practices";
import { requireSession } from "@/lib/session";

/**
 * Settings (PRD §9.9). Admin-facing configuration.
 *
 * Note what is NOT here: the allowed email domains. Access control lives in the
 * environment on purpose — a control that can be widened from inside the app is
 * a privilege-escalation path (see src/domain/access.ts).
 */

const towerEnum = z.enum(TOWER_KEYS);

/**
 * Rename a tower's partner.
 *
 * This is why `partner_towers` exists: routing used to match the tower key
 * inside the partner's NAME, so the first rename would have silently broken
 * every packet and draft.
 */
export async function renamePartner(tower: string, name: string) {
  const session = await requireSession();

  const parsedTower = towerEnum.safeParse(tower);
  const clean = name.trim();
  if (!parsedTower.success) return { ok: false as const, message: "Unknown tower." };
  if (!clean) return { ok: false as const, message: "A partner needs a name." };

  const [row] = await db
    .select({ userId: partnerTowers.userId })
    .from(partnerTowers)
    .where(and(eq(partnerTowers.orgId, session.orgId), eq(partnerTowers.tower, parsedTower.data)))
    .limit(1);

  if (!row) return { ok: false as const, message: "No partner is assigned to that tower yet." };

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
  const parsed = orgSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, message: parsed.error.issues[0]?.message ?? "Those settings are not valid." };
  }

  await db.update(settings).set(parsed.data).where(eq(settings.orgId, session.orgId));
  revalidatePath("/settings");
  return { ok: true as const };
}

/* --------------------------------------------------------------- DNC (§8) */

export async function addToDnc(name: string, reason: string) {
  const session = await requireSession();
  const clean = name.trim();
  if (!clean) return { ok: false as const, message: "Name required." };

  await db
    .insert(dnc)
    .values({ id: randomUUID(), orgId: session.orgId, name: clean, kind: "company", reason: reason.trim() || null, addedBy: session.userId })
    .onConflictDoNothing({ target: [dnc.orgId, dnc.name] });

  // §8 wants an audit entry on every write, and this one governs who we may
  // contact — exactly the kind that should be traceable.
  await db.insert(activities).values({
    orgId: session.orgId, type: "note",
    payloadJson: { action: "dnc_added", name: clean, reason }, actorId: session.userId,
  });

  revalidatePath("/settings");
  return { ok: true as const };
}

export async function removeFromDnc(name: string) {
  const session = await requireSession();
  await db.delete(dnc).where(and(eq(dnc.orgId, session.orgId), eq(dnc.name, name)));

  await db.insert(activities).values({
    orgId: session.orgId, type: "note",
    payloadJson: { action: "dnc_removed", name }, actorId: session.userId,
  });

  revalidatePath("/settings");
  return { ok: true as const };
}
