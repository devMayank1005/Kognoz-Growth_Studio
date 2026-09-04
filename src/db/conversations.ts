import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { conversations, member } from "@/db/schema";
import type { EngineChart, EngineRow } from "@/engine/schemas";
import { titleFromText } from "@/lib/titles";

/**
 * Named chat conversations (PRD §3), replacing the single rolling thread.
 *
 * Two isolation rules hold here, and this is the only place they are enforced:
 *
 * 1. **Org**, as everywhere else in the repository layer — every query filters
 *    on the caller's `orgId`.
 * 2. **User**, which is specific to this table. A conversation is private to the
 *    person who created it, so every query also filters on `userId`. Passing an
 *    id belonging to someone else returns nothing rather than their chat; that
 *    is why the id alone is never enough to load a row.
 *
 * Pipeline, Today, accounts, dashboard and settings stay org-wide — only chat is
 * per-person.
 */

export interface ConversationTurn {
  role: "user" | "engine";
  text: string;
  chart?: EngineChart | null;
  rows?: EngineRow[];
  /** Marks the brief so the UI can give it the Poppins headline of §9.9. */
  kind?: "brief" | "answer";
  at: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  kind: "chat" | "brief";
  updatedAt: Date;
}

/** Keep a stored conversation bounded; the operator scrolls, they do not archive. */
const MAX_TURNS = 200;

/**
 * The switcher's list. The brief sorts first so it is always in the same place,
 * then working conversations most-recent-first.
 */
export async function listConversations(orgId: string, userId: string): Promise<ConversationSummary[]> {
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      kind: conversations.kind,
      updatedAt: conversations.updatedAt,
    })
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.userId, userId)))
    .orderBy(asc(sql`case when ${conversations.kind} = 'brief' then 0 else 1 end`), desc(conversations.updatedAt));

  return rows as ConversationSummary[];
}

export interface LoadedConversation extends ConversationSummary {
  turns: ConversationTurn[];
}

/** Loads one conversation, or null when it is missing or belongs to someone else. */
export async function loadConversation(
  orgId: string,
  userId: string,
  id: string,
): Promise<LoadedConversation | null> {
  const [row] = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      kind: conversations.kind,
      updatedAt: conversations.updatedAt,
      messages: conversations.messagesJson,
    })
    .from(conversations)
    .where(and(eq(conversations.orgId, orgId), eq(conversations.userId, userId), eq(conversations.id, id)))
    .limit(1);

  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as "chat" | "brief",
    updatedAt: row.updatedAt,
    turns: (row.messages as ConversationTurn[] | undefined) ?? [],
  };
}

export async function createConversation(
  orgId: string,
  userId: string,
  title = "New conversation",
): Promise<string> {
  const [row] = await db
    .insert(conversations)
    .values({ orgId, userId, title, kind: "chat" })
    .returning({ id: conversations.id });
  return row.id;
}

export async function renameConversation(
  orgId: string,
  userId: string,
  id: string,
  title: string,
): Promise<boolean> {
  const rows = await db
    .update(conversations)
    .set({ title: titleFromText(title) })
    .where(and(eq(conversations.orgId, orgId), eq(conversations.userId, userId), eq(conversations.id, id)))
    .returning({ id: conversations.id });
  return rows.length > 0;
}

/** Returns the deleted row, so the caller can offer Undo (PRD §9.6). */
export async function deleteConversation(
  orgId: string,
  userId: string,
  id: string,
): Promise<{ title: string; turns: ConversationTurn[] } | null> {
  const rows = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.orgId, orgId),
        eq(conversations.userId, userId),
        eq(conversations.id, id),
        // The brief conversation is not the operator's to delete; it is
        // rewritten every morning and would simply reappear.
        eq(conversations.kind, "chat"),
      ),
    )
    .returning({ title: conversations.title, messages: conversations.messagesJson });

  const row = rows[0];
  if (!row) return null;
  return { title: row.title, turns: (row.messages as ConversationTurn[] | undefined) ?? [] };
}

/** Puts a deleted conversation back, keeping its turns. Used by Undo. */
export async function restoreConversation(
  orgId: string,
  userId: string,
  title: string,
  turns: ConversationTurn[],
): Promise<string> {
  const [row] = await db
    .insert(conversations)
    .values({ orgId, userId, title, kind: "chat", messagesJson: turns })
    .returning({ id: conversations.id });
  return row.id;
}

/**
 * Appends turns to a conversation.
 *
 * The concat and the trim happen **inside one UPDATE**, so two requests
 * finishing at the same moment cannot lose each other's turns. The old
 * `threads.appendTurns` read the array into Node, appended, and wrote it back —
 * a lost update waiting to happen, and the reason an answer could vanish.
 *
 * Returns false when the conversation does not exist or is not the caller's.
 */
export async function appendTurns(
  orgId: string,
  userId: string,
  id: string,
  turns: ConversationTurn[],
): Promise<boolean> {
  if (turns.length === 0) return true;

  const added = JSON.stringify(turns);
  const result = await db.execute(sql`
    with merged as (
      select id, (messages_json || ${added}::jsonb) as m
      from conversations
      where id = ${id} and org_id = ${orgId} and user_id = ${userId}
    )
    update conversations c
    set messages_json = coalesce(
          (
            select jsonb_agg(e order by n)
            from jsonb_array_elements(merged.m) with ordinality as t(e, n)
            where n > greatest(0, jsonb_array_length(merged.m) - ${MAX_TURNS})
          ),
          '[]'::jsonb
        ),
        updated_at = now()
    from merged
    where c.id = merged.id
    returning c.id
  `);

  return (result.rowCount ?? 0) > 0;
}

/**
 * The user's pinned brief conversation, created on first use.
 *
 * The partial unique index makes this an upsert rather than select-then-insert,
 * so two brief runs racing cannot produce two brief conversations.
 */
export async function briefConversationId(orgId: string, userId: string): Promise<string> {
  const [row] = await db
    .insert(conversations)
    .values({ orgId, userId, title: "Morning brief", kind: "brief" })
    .onConflictDoUpdate({
      target: [conversations.orgId, conversations.userId],
      targetWhere: sql`kind = 'brief'`,
      set: { updatedAt: new Date() },
    })
    .returning({ id: conversations.id });
  return row.id;
}

/**
 * Posts the morning brief into each member's pinned brief conversation.
 *
 * Scoped to real members of the org. It used to select the whole `user` table,
 * so the placeholder partner records — rows that exist to own pipeline cards,
 * not people who sign in — each got a brief written for them every night.
 *
 * Replaces any brief already posted today rather than stacking duplicates.
 */
export async function postBriefToOperators(
  orgId: string,
  brief: Omit<ConversationTurn, "role" | "at" | "kind">,
): Promise<number> {
  const members = await db
    .select({ id: member.userId })
    .from(member)
    .where(eq(member.organizationId, orgId));

  const today = new Date().toISOString().slice(0, 10);
  const turn: ConversationTurn = { role: "engine", kind: "brief", at: new Date().toISOString(), ...brief };

  let posted = 0;
  for (const { id: userId } of members) {
    const conversationId = await briefConversationId(orgId, userId);
    const existing = await loadConversation(orgId, userId, conversationId);
    const withoutToday = (existing?.turns ?? []).filter(
      (t) => !(t.kind === "brief" && t.at.slice(0, 10) === today),
    );

    await db
      .update(conversations)
      .set({ messagesJson: [...withoutToday, turn].slice(-MAX_TURNS), updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    posted++;
  }
  return posted;
}

/**
 * The conversation to open when none is named: the brief if it exists, else the
 * most recent. Returns null for a brand-new operator, who gets one on first ask.
 */
export async function defaultConversationId(orgId: string, userId: string): Promise<string | null> {
  const [first] = await listConversations(orgId, userId);
  return first?.id ?? null;
}
