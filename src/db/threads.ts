import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { threads, user } from "@/db/schema";
import type { EngineChart, EngineRow } from "@/engine/schemas";

/**
 * Chat history, one thread per user (PRD §3).
 *
 * This is also where the morning brief lands: the scheduled job writes it here
 * so opening the app renders it from Postgres instead of triggering a model
 * call. Without persistence the brief would have nowhere to be.
 */

export interface ThreadTurn {
  role: "user" | "engine";
  text: string;
  chart?: EngineChart | null;
  rows?: EngineRow[];
  /** Marks the brief so the UI can give it the Poppins headline of §9.9. */
  kind?: "brief" | "answer";
  at: string;
}

/** Keep the stored thread bounded; the operator scrolls, they do not archive. */
const MAX_TURNS = 200;

export async function loadThread(orgId: string, userId: string): Promise<ThreadTurn[]> {
  const [row] = await db
    .select({ messages: threads.messagesJson })
    .from(threads)
    .where(and(eq(threads.orgId, orgId), eq(threads.userId, userId)))
    .limit(1);
  return (row?.messages as ThreadTurn[] | undefined) ?? [];
}

export async function appendTurns(orgId: string, userId: string, turns: ThreadTurn[]): Promise<void> {
  if (turns.length === 0) return;
  const existing = await loadThread(orgId, userId);
  const next = [...existing, ...turns].slice(-MAX_TURNS);

  const [row] = await db
    .select({ id: threads.id })
    .from(threads)
    .where(and(eq(threads.orgId, orgId), eq(threads.userId, userId)))
    .limit(1);

  if (row) {
    await db.update(threads).set({ messagesJson: next, updatedAt: new Date() }).where(eq(threads.id, row.id));
  } else {
    await db.insert(threads).values({ orgId, userId, messagesJson: next });
  }
}

/**
 * Post the morning brief to every operator in the org.
 *
 * Replaces any brief already posted today, so a re-run refreshes rather than
 * stacking duplicates at the top of the thread.
 */
export async function postBriefToOperators(orgId: string, brief: Omit<ThreadTurn, "role" | "at" | "kind">): Promise<number> {
  const members = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(threads, eq(threads.userId, user.id))
    .where(eq(threads.orgId, orgId));

  // Everyone with a thread, plus anyone who has never chatted — the brief is
  // the first thing a new operator should see.
  const allUsers = await db.select({ id: user.id }).from(user);
  const targets = new Set([...members.map((m) => m.id), ...allUsers.map((u) => u.id)]);

  const today = new Date().toISOString().slice(0, 10);
  const turn: ThreadTurn = { role: "engine", kind: "brief", at: new Date().toISOString(), ...brief };

  let posted = 0;
  for (const userId of targets) {
    const existing = await loadThread(orgId, userId);
    const withoutTodaysBrief = existing.filter((t) => !(t.kind === "brief" && t.at.slice(0, 10) === today));
    const next = [...withoutTodaysBrief, turn].slice(-MAX_TURNS);

    const [row] = await db
      .select({ id: threads.id })
      .from(threads)
      .where(and(eq(threads.orgId, orgId), eq(threads.userId, userId)))
      .limit(1);

    if (row) {
      await db.update(threads).set({ messagesJson: next, updatedAt: new Date() }).where(eq(threads.id, row.id));
    } else {
      await db.insert(threads).values({ orgId, userId, messagesJson: next });
    }
    posted++;
  }
  return posted;
}

export { desc };
