"use server";

import { revalidatePath } from "next/cache";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db, withOrg } from "@/db/client";
import { accounts, activities, dnc, drafts, opportunities, people, settings, signals, stages, user } from "@/db/schema";
import { isDoNotContact } from "@/domain/dnc";
import { applyOutcome, OUTCOMES, type Outcome } from "@/domain/outcomes";
import { constantsMatch, formatCompact, MIGRATION_IN_PROGRESS } from "@/domain/money";
import { buildPacket } from "@/domain/packet";
import { loadMoneyView } from "@/lib/money-view";
import { practiceById } from "@/domain/practices";
import { afterSend, defaultDraftKind, DRAFT_KINDS, type DraftKind } from "@/domain/touches";
import { writeDraft } from "@/engine/draft";
import { checkBudget, logModelCall } from "@/engine/budget";
import { PROSE_MODEL, engineConfigError } from "@/engine/client";
import { CONSTANTS_CURRENCY } from "@/domain/revenue";
import { CORE_FLOOR, VALUE_CAP, WHALE_FLOOR, tierFor, type Tier } from "@/domain/routing";
import { permissionError, requireSession } from "@/lib/session";
import { queueZohoPush } from "@/lib/zoho/notify";

/**
 * The three things an operator does to a card: draft to it, packet it to a
 * partner, or record what happened.
 *
 * All three check the do-not-contact list. PRD §8 says "enforced on add,
 * draft, and packet" — three call sites, one tested rule.
 */

/**
 * Runtime schemas for arguments that arrive from the browser.
 *
 * Every one of these is typed in the signature and none of it was checked. A
 * server action is a public endpoint: `recordOutcome("...", "banana")` reached
 * `applyOutcome`, which does `GRID[outcome]` and then reads `rule.stage` off
 * undefined -- a TypeError, and so an unhandled 500 rather than a refusal.
 *
 * The ids matter as much. These columns are `uuid`, so a non-uuid string reaches
 * Postgres as `invalid input syntax for type uuid`, which is also a 500. Cheaper
 * to say "not found".
 */
const idSchema = z.string().uuid();
const outcomeSchema = z.enum(OUTCOMES);
const draftKindSchema = z.enum(DRAFT_KINDS);
/** Written into `activities.payload_json`, so it needs a ceiling. */
const reasonSchema = z.string().trim().max(500).optional();

const badRequest = (message: string) => ({ ok: false as const, message });

const today = () => new Date().toISOString().slice(0, 10);

async function loadCard(orgId: string, opportunityId: string) {
  const [row] = await db
    .select({
      id: opportunities.id,
      accountId: opportunities.accountId,
      account: accounts.name,
      country: accounts.country,
      segment: accounts.segment,
      practiceId: opportunities.practiceId,
      tower: opportunities.tower,
      stage: opportunities.stage,
      value: opportunities.value,
      tier: opportunities.tier,
      whale: opportunities.whale,
      touches: opportunities.touches,
      evidence: opportunities.evidence,
      url: opportunities.url,
      contactRole: opportunities.contactRole,
      contactName: people.name,
      contactTitle: people.role,
      partner: user.name,
      anchor: accounts.anchor,
      dispatchedAt: opportunities.dispatchedAt,
    })
    .from(opportunities)
    .innerJoin(accounts, eq(opportunities.accountId, accounts.id))
    .leftJoin(user, eq(opportunities.partnerUserId, user.id))
    .leftJoin(people, eq(opportunities.contactPersonId, people.id))
    .where(and(eq(opportunities.orgId, orgId), eq(opportunities.id, opportunityId)))
    .limit(1);
  return row;
}

/** §8 — the same rule at every call site. */
async function assertNotBlocked(orgId: string, account: string): Promise<string | null> {
  const list = await db.select({ name: dnc.name }).from(dnc).where(eq(dnc.orgId, orgId));
  return isDoNotContact(account, list.map((d) => d.name))
    ? `${account} is on the do-not-contact list.`
    : null;
}

/* ------------------------------------------------------------------ draft */

export type DraftResult =
  | { ok: true; draftId: string; subject: string; body: string; mailto: string }
  | { ok: false; message: string };

export async function generateDraft(opportunityId: string, kind?: DraftKind): Promise<DraftResult> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");
  if (kind !== undefined && !draftKindSchema.safeParse(kind).success) {
    return badRequest("That is not a kind of draft this app writes.");
  }
  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const blocked = await assertNotBlocked(session.orgId, card.account);
  if (blocked) return { ok: false, message: `${blocked} No draft can be written.` };

  const practice = practiceById(card.practiceId);
  // Same rule as the inspector, so a caller that omits the kind still gets the
  // two-beat play rather than a pitch that spends a touch.
  const chosen = kind ?? defaultDraftKind(card);

  // A misconfigured key cannot be retried into working. Say so before spending
  // a round trip and before offering the operator a button that cannot succeed.
  if (engineConfigError) {
    return { ok: false, message: `The engine is not configured on the server: ${engineConfigError}` };
  }

  /**
   * Drafts spent against the daily budget without being subject to it —
   * checkBudget had exactly one caller, the chat route. The failure mode was
   * inverted from what an operator expects: a morning sweep could exhaust the
   * day and then only chat, the one guarded path, refused.
   */
  const budget = await checkBudget(session.orgId);
  if (!budget.allowed) {
    return {
      ok: false,
      message: `Daily model budget reached (${budget.used}/${budget.budget}). Drafts resume tomorrow, or raise the budget in Settings.`,
    };
  }

  const started = Date.now();
  let result;
  try {
    result = await writeDraft({
      kind: chosen,
      account: card.account,
      country: card.country ?? undefined,
      practice: practice?.name,
      pain: practice?.pain,
      proofPoint: practice?.proofShort,
      trigger: card.evidence ?? undefined,
      url: card.url ?? undefined,
      // A verified person, else the role. Never a guessed name (§9.5).
      recipient: card.contactName
        ? `${card.contactName}, ${card.contactTitle ?? ""}`.trim()
        : (card.contactRole || practice?.buyer || "CHRO"),
      senderName: session.name,
      senderTitle: "Partner",
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await logModelCall({ orgId: session.orgId, kind: "draft", model: PROSE_MODEL, error: detail });

    // Twelve identical failures were once reported as "try again" because a
    // pasted API key carried a comment line into an HTTP header. Configuration
    // is not bad luck: name it, and do not invite a retry that cannot work.
    const misconfigured =
      /invalid header value|authentication_error|invalid x-api-key|permission_error|401|403/i.test(detail);
    return {
      ok: false,
      message: misconfigured
        ? "The engine rejected the server's credentials. This needs an admin — retrying will not help."
        : "The draft could not be written. Try again.",
    };
  }

  await logModelCall({
    orgId: session.orgId, kind: `draft:${chosen}`, model: PROSE_MODEL,
    usage: result.usage, latencyMs: Date.now() - started,
  });

  const [saved] = await db
    .insert(drafts)
    .values({
      orgId: session.orgId, opportunityId, kind: chosen,
      subject: result.draft.subject, body: result.draft.body, actorId: session.userId,
    })
    .returning({ id: drafts.id });

  await db.insert(activities).values({
    orgId: session.orgId, opportunityId, accountId: card.accountId,
    type: "draft", payloadJson: { kind: chosen, subject: result.draft.subject },
    actorId: session.userId,
  });

  const [cfg] = await db
    .select({ bcc: settings.zohoBcc })
    .from(settings)
    .where(eq(settings.orgId, session.orgId))
    .limit(1);

  // §4.5: "Open in mail · BCC Zoho". A mailto opens the operator's own client;
  // nothing is sent from here. Sending domains are still an open item (§14).
  const params = new URLSearchParams({ subject: result.draft.subject, body: result.draft.body });
  if (cfg?.bcc) params.set("bcc", cfg.bcc);

  return {
    ok: true, draftId: saved.id,
    subject: result.draft.subject, body: result.draft.body,
    mailto: `mailto:?${params.toString()}`,
  };
}

/** Confirms the operator sent it: advances the stage and counts the touch. */
export interface CardPatch {
  stage: string;
  touches: number;
  next: string;
  due: string;
}

export async function markDraftSent(
  opportunityId: string,
  draftId: string,
  kind: DraftKind,
): Promise<{ ok: true; patch: CardPatch; rotateOrPark: boolean } | { ok: false; message: string }> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");
  if (!idSchema.safeParse(draftId).success) return badRequest("Draft not found.");
  if (!draftKindSchema.safeParse(kind).success) {
    return badRequest("That is not a kind of draft this app writes.");
  }
  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const result = afterSend({ stage: card.stage, touches: card.touches }, kind);

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({
        stage: result.stage ?? card.stage,
        touches: result.touches,
        nextStep: result.next,
        dueOn: result.dueOn,
        updatedAt: new Date(),
      })
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, session.orgId)));

    // Scoped to the org AND the card. This used to update by draft id alone, so
    // a leaked or guessed UUID could mark another org's draft as sent while the
    // audit row recorded this caller's card.
    await tx
      .update(drafts)
      .set({ sentAt: new Date() })
      .where(
        and(
          eq(drafts.id, draftId),
          eq(drafts.opportunityId, opportunityId),
          eq(drafts.orgId, session.orgId),
        ),
      );

    await tx.insert(activities).values({
      orgId: session.orgId, opportunityId, accountId: card.accountId,
      type: "sent",
      payloadJson: { kind, touches: result.touches, rotateOrPark: result.rotateOrPark },
      actorId: session.userId,
    });
  });

  // After the commit, never inside it: a worker that reads mid-transaction
  // sees the old row. Never throws (§12 #6).
  await queueZohoPush(session.orgId, opportunityId, "changed");

  return {
    ok: true,
    patch: { stage: result.stage ?? card.stage, touches: result.touches, next: result.next, due: result.dueOn },
    rotateOrPark: result.rotateOrPark,
  };
}

/* ----------------------------------------------------------------- packet */

export type PacketResult = { ok: true; text: string; patch: Partial<CardPatch> } | { ok: false; message: string };

export async function dispatchPacket(opportunityId: string): Promise<PacketResult> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");
  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const blocked = await assertNotBlocked(session.orgId, card.account);
  if (blocked) return { ok: false, message: `${blocked} No packet can be sent.` };

  // Attach the most recent unsent draft, so the partner gets something to edit.
  const [latest] = await db
    .select({ subject: drafts.subject, body: drafts.body })
    .from(drafts)
    .where(eq(drafts.opportunityId, opportunityId))
    .orderBy(desc(drafts.createdAt))
    .limit(1);

  const text = buildPacket(
    {
      account: card.account, country: card.country ?? undefined,
      tower: card.tower, partner: card.partner ?? undefined,
      practice: practiceById(card.practiceId)?.name,
      value: card.value, tier: card.tier, whale: card.whale,
      evidence: card.evidence ?? undefined, url: card.url ?? undefined,
      contact: card.contactName ? `${card.contactName} (${card.contactTitle ?? ""})` : (card.contactRole ?? ""),
    },
    {
      today: today(),
      warmPath: card.anchor ?? undefined,
      draft: latest,
      // The packet goes to a partner with a figure on it. It must be the
      // currency the figure is actually in.
      currency: (await loadMoneyView(session.orgId)).base,
    },
  );

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({
        dispatchedAt: new Date(),
        // A Prospect handed to a partner becomes Tagged (§5).
        ...(card.stage === "Prospect"
          ? { stage: "Plan reach-out" as const, nextStep: "Partner to open", dueOn: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10) }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, opportunityId));

    await tx.insert(activities).values({
      orgId: session.orgId, opportunityId, accountId: card.accountId,
      type: "packet", payloadJson: { partner: card.partner }, actorId: session.userId,
    });
  });

  return {
    ok: true,
    text,
    patch: card.stage === "Prospect" ? { stage: "Plan reach-out", next: "Partner to open" } : {},
  };
}

/* ---------------------------------------------------------------- outcome */

export async function recordOutcome(
  opportunityId: string,
  outcome: Outcome,
): Promise<{ ok: true; patch: Partial<CardPatch> } | { ok: false; message: string }> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");
  // Unknown outcomes used to reach GRID[outcome] and crash on rule.stage.
  if (!outcomeSchema.safeParse(outcome).success) return badRequest("That is not an outcome this app records.");
  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const effect = applyOutcome(outcome);

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({
        ...(effect.stage ? { stage: effect.stage } : {}),
        ...(effect.next ? { nextStep: effect.next } : {}),
        ...(effect.dueOn !== undefined ? { dueOn: effect.dueOn } : {}),
        ...(effect.clearDispatched ? { dispatchedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, opportunityId));

    await tx.insert(activities).values({
      orgId: session.orgId, opportunityId, accountId: card.accountId,
      type: outcome === "won" ? "won" : outcome === "dead" ? "lost" : outcome === "park" ? "park" : outcome === "meeting" ? "meeting" : "replied",
      payloadJson: { outcome }, actorId: session.userId,
    });
  });

  // After the commit, never inside it: a worker that reads mid-transaction
  // sees the old row. Never throws (§12 #6).
  await queueZohoPush(session.orgId, opportunityId, "changed");

  return {
    ok: true,
    patch: {
      ...(effect.stage ? { stage: effect.stage } : {}),
      ...(effect.next ? { next: effect.next } : {}),
      ...(effect.dueOn !== undefined ? { due: effect.dueOn } : {}),
    },
  };
}

/**
 * Move a card to a stage directly — the Kanban drop.
 *
 * Deliberately shares this file with recordOutcome rather than living in its
 * own action: a stage change means the same thing whether it came from the
 * outcome grid or a drag, and two implementations would drift.
 */
export async function moveToStage(
  opportunityId: string,
  stage: (typeof stages)[number],
): Promise<{ ok: true; stage: string } | { ok: false; message: string }> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!stages.includes(stage)) return { ok: false, message: "Unknown stage." };
  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");

  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };
  if (card.stage === stage) return { ok: true, stage };

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({
        stage,
        // A card that reaches a talking stage is no longer waiting on a
        // partner, so it should stop showing in "with partners over 3 days".
        ...(["In conversation", "Meeting set", "Proposal"].includes(stage) ? { dispatchedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(opportunities.id, opportunityId));

    await tx.insert(activities).values({
      orgId: session.orgId,
      opportunityId,
      accountId: card.accountId,
      type: stage === "Won" ? "won" : stage === "Lost" ? "lost" : "note",
      payloadJson: { action: "stage_moved", from: card.stage, to: stage, via: "kanban" },
      actorId: session.userId,
    });
  });

  // After the commit, never inside it: a worker that reads mid-transaction
  // sees the old row. Never throws (§12 #6).
  await queueZohoPush(session.orgId, opportunityId, "changed");

  return { ok: true, stage };
}

/** Timeline for the inspector (§5): every add, draft, send, packet, outcome. */
export async function loadTimeline(opportunityId: string) {
  const session = await requireSession();
  // A read, but the column is `uuid`: a malformed id is a Postgres syntax error
  // and therefore a 500. An empty timeline is the honest answer.
  if (!idSchema.safeParse(opportunityId).success) return [];
  return db
    .select({
      type: activities.type,
      payload: activities.payloadJson,
      at: activities.at,
      actor: user.name,
    })
    .from(activities)
    .leftJoin(user, eq(activities.actorId, user.id))
    .where(and(eq(activities.orgId, session.orgId), eq(activities.opportunityId, opportunityId)))
    .orderBy(desc(activities.at))
    .limit(20);
}

/* ------------------------------------------------------------------ value */

/**
 * Sets a card's value, per PRD §5 ("Values: editable").
 *
 * Until now the only value a card ever had was the engine's default: there was
 * no writer anywhere, so a wedge could never be re-priced as it grew. The tier
 * is recomputed from the value rather than stored independently, and crossing
 * into core from a wedge writes its own activity — that crossing is a §7
 * scoreboard metric which nothing could previously produce.
 */
export async function setCardValue(
  opportunityId: string,
  value: number,
): Promise<{ ok: true; value: number; tier: Tier; whale: boolean } | { ok: false; message: string }> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;

  const money = await loadMoneyView(session.orgId);
  // Fails closed while a currency change is half-applied — see `constantsMatch`.
  if (!constantsMatch(money.base, CONSTANTS_CURRENCY)) {
    return { ok: false, message: MIGRATION_IN_PROGRESS };
  }

  if (!idSchema.safeParse(opportunityId).success) return badRequest("Card not found.");
  if (!Number.isFinite(value) || value < 0) return { ok: false, message: "Value must be a positive number." };
  if (value > VALUE_CAP) {
    return { ok: false, message: `That value looks wrong — cap is ${formatCompact(VALUE_CAP, money.base)}.` };
  }

  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const rounded = Math.round(value);
  const tier = tierFor(rounded);
  const whale = rounded >= WHALE_FLOOR;
  /**
   * `CORE_FLOOR`, not a bare literal.
   *
   * This read `card.value < 100_000` — a number that looks like the core floor
   * but is not it, and would not have moved when the floors did. The §7
   * wedge-to-core crossing metric would have quietly stopped being produced,
   * with nothing failing and nothing to see.
   */
  const crossedToCore = card.value < CORE_FLOOR && rounded >= CORE_FLOOR;

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(opportunities)
      .set({ value: rounded, tier, whale, updatedAt: new Date() })
      .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, session.orgId)));

    await tx.insert(activities).values({
      orgId: session.orgId,
      opportunityId,
      accountId: card.accountId,
      type: crossedToCore ? "wedge_to_core" : "value_changed",
      payloadJson: { from: card.value, to: rounded, tier, whale },
      actorId: session.userId,
    });
  });

  // After the commit, never inside it: a worker that reads mid-transaction
  // sees the old row. Never throws (§12 #6).
  await queueZohoPush(session.orgId, opportunityId, "changed");

  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");

  return { ok: true, value: rounded, tier, whale };
}

/* ---------------------------------------------------------------- signals */

/**
 * Retires a signal so it stops ranking.
 *
 * `signals.dismissedAt` had three readers and no writer at all, so one wrong
 * radar find polluted the brief, the Today list and every account count
 * permanently, with no way for the operator to say "this is not real".
 */
export async function dismissSignal(
  signalId: string,
  reason?: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireSession();
  const denied = permissionError(session, "managePipeline");
  if (denied) return denied;
  if (!idSchema.safeParse(signalId).success) return badRequest("Signal not found.");
  const parsedReason = reasonSchema.safeParse(reason);
  if (!parsedReason.success) return badRequest("That reason is too long.");

  const [signal] = await db
    .select({ id: signals.id, accountId: signals.accountId, code: signals.code })
    .from(signals)
    .where(and(eq(signals.id, signalId), eq(signals.orgId, session.orgId)))
    .limit(1);
  if (!signal) return { ok: false, message: "Signal not found." };

  await withOrg(session.orgId, async (tx) => {
    await tx
      .update(signals)
      .set({ dismissedAt: new Date() })
      .where(and(eq(signals.id, signalId), eq(signals.orgId, session.orgId)));

    await tx.insert(activities).values({
      orgId: session.orgId,
      accountId: signal.accountId,
      type: "signal_dismissed",
      payloadJson: { signalId, code: signal.code, reason: parsedReason.data ?? "" },
      actorId: session.userId,
    });
  });

  revalidatePath("/today");
  revalidatePath("/accounts");
  revalidatePath("/", "layout");

  return { ok: true };
}
