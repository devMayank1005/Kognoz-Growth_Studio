"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db/client";
import {
  createConversation,
  deleteConversation,
  renameConversation,
  restoreConversation,
  type ConversationTurn,
} from "@/db/conversations";
import { activities } from "@/db/schema";
import { requireSession } from "@/lib/session";

/**
 * Conversation management (PRD §3, §9.6).
 *
 * Every one of these is scoped to the signed-in user inside the data layer, so
 * an id belonging to someone else simply does not resolve. These actions never
 * take an orgId or userId from the caller — only from the session.
 */

const id = z.string().uuid();

export async function newConversation(): Promise<{ ok: true; id: string }> {
  const session = await requireSession();
  const conversationId = await createConversation(session.orgId, session.userId);
  revalidatePath("/chat");
  return { ok: true, id: conversationId };
}

export async function rename(
  conversationId: string,
  title: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requireSession();
  if (!id.safeParse(conversationId).success) return { ok: false, message: "Unknown conversation." };

  const clean = title.trim();
  if (!clean) return { ok: false, message: "A title is required." };

  const done = await renameConversation(session.orgId, session.userId, conversationId, clean);
  if (!done) return { ok: false, message: "That conversation is no longer there." };

  revalidatePath("/chat");
  return { ok: true };
}

export type RemovedConversation = { title: string; turns: ConversationTurn[] };

/**
 * Deletes a conversation and hands back its contents, so the toast can offer
 * Undo for six seconds (§9.6) rather than asking "are you sure?" first.
 */
export async function remove(
  conversationId: string,
): Promise<{ ok: true; removed: RemovedConversation } | { ok: false; message: string }> {
  const session = await requireSession();
  if (!id.safeParse(conversationId).success) return { ok: false, message: "Unknown conversation." };

  const removed = await deleteConversation(session.orgId, session.userId, conversationId);
  if (!removed) return { ok: false, message: "That conversation is no longer there." };

  await db.insert(activities).values({
    orgId: session.orgId,
    type: "conversation_deleted",
    payloadJson: { title: removed.title, turns: removed.turns.length },
    actorId: session.userId,
  });

  revalidatePath("/chat");
  return { ok: true, removed };
}

/** Undo. Restores under a new id — the old one is gone for good. */
export async function undoRemove(
  removed: RemovedConversation,
): Promise<{ ok: true; id: string }> {
  const session = await requireSession();
  const conversationId = await restoreConversation(
    session.orgId,
    session.userId,
    removed.title,
    removed.turns,
  );
  revalidatePath("/chat");
  return { ok: true, id: conversationId };
}
