"use server";

import { and, desc, eq } from "drizzle-orm";

import { db, withOrg } from "@/db/client";
import { accounts, activities, dnc, drafts, opportunities, people, settings, stages, user } from "@/db/schema";
import { isDoNotContact } from "@/domain/dnc";
import { applyOutcome, type Outcome } from "@/domain/outcomes";
import { buildPacket } from "@/domain/packet";
import { practiceById } from "@/domain/practices";
import { afterSend, stageKind, type DraftKind } from "@/domain/touches";
import { writeDraft } from "@/engine/draft";
import { logModelCall } from "@/engine/budget";
import { PROSE_MODEL, engineConfigError } from "@/engine/client";
import { requireSession } from "@/lib/session";

/**
 * The three things an operator does to a card: draft to it, packet it to a
 * partner, or record what happened.
 *
 * All three check the do-not-contact list. PRD §8 says "enforced on add,
 * draft, and packet" — three call sites, one tested rule.
 */

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
  const card = await loadCard(session.orgId, opportunityId);
  if (!card) return { ok: false, message: "Card not found." };

  const blocked = await assertNotBlocked(session.orgId, card.account);
  if (blocked) return { ok: false, message: `${blocked} No draft can be written.` };

  const practice = practiceById(card.practiceId);
  const chosen = kind ?? stageKind(card.stage);

  // A misconfigured key cannot be retried into working. Say so before spending
  // a round trip and before offering the operator a button that cannot succeed.
  if (engineConfigError) {
    return { ok: false, message: `The engine is not configured on the server: ${engineConfigError}` };
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
      .where(eq(opportunities.id, opportunityId));

    await tx.update(drafts).set({ sentAt: new Date() }).where(eq(drafts.id, draftId));

    await tx.insert(activities).values({
      orgId: session.orgId, opportunityId, accountId: card.accountId,
      type: "sent",
      payloadJson: { kind, touches: result.touches, rotateOrPark: result.rotateOrPark },
      actorId: session.userId,
    });
  });

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
    { today: today(), warmPath: card.anchor ?? undefined, draft: latest },
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
  if (!stages.includes(stage)) return { ok: false, message: "Unknown stage." };

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

  return { ok: true, stage };
}

/** Timeline for the inspector (§5): every add, draft, send, packet, outcome. */
export async function loadTimeline(opportunityId: string) {
  const session = await requireSession();
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
