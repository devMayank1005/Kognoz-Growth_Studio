/**
 * The one place a raw Zoho record becomes something this application may keep.
 *
 * PRD §8 forbids storing personal contact data, and Zoho Deals, Leads and
 * Contacts all carry `Email`, `Phone` and `Mobile`. The reconcile reads from
 * that API hourly, so without a hard boundary those fields would reach Postgres
 * and every `pg_dump` — and `backups/` is gitignored precisely because dumps
 * contain real addresses.
 *
 * This is an explicit PICK, not a schema that strips. A Zod `.parse()` dropping
 * unknown keys is correct but silent — it tells you nothing about what it threw
 * away, and it is one `.passthrough()` from being wrong. Building a new object
 * from a fixed key list and then ASSERTING the result is clean fails loudly if
 * the pick is ever broken, which is the behaviour worth having here.
 */

import { assertNoContactData } from "./forbidden";
import type { PulledDeal } from "./types";

export type PullOutcome =
  | { ok: true; deal: PulledDeal; droppedKeys: number }
  | { ok: false; reason: "not-an-object" | "no-id" | "bad-modified-time" };

/** Zoho returns Amount as a number, sometimes as a numeric string, sometimes null. */
function toAmount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parsePulledDeal(raw: unknown): PullOutcome {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "not-an-object" };
  }

  const src = raw as Record<string, unknown>;

  const id = typeof src.id === "string" ? src.id : String(src.id ?? "");
  if (!id) return { ok: false, reason: "no-id" };

  // Required: it is the watermark the whole last-write-wins rule rests on.
  // A record without it cannot be compared, so it is refused rather than
  // silently treated as "never modified".
  const modifiedTime = typeof src.Modified_Time === "string" ? src.Modified_Time : "";
  if (!modifiedTime || Number.isNaN(Date.parse(modifiedTime))) {
    return { ok: false, reason: "bad-modified-time" };
  }

  const deal: PulledDeal = {
    id,
    stage: typeof src.Stage === "string" ? src.Stage : "",
    amount: toAmount(src.Amount),
    modifiedTime,
  };

  // Must never fire. If it does, the pick above has been broken by an edit and
  // the sync should stop rather than write whatever it just built.
  assertNoContactData(deal, "parsePulledDeal");

  return { ok: true, deal, droppedKeys: Object.keys(src).length - 4 };
}
