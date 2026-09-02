/**
 * Do-not-contact (PRD §8).
 *
 * "Shared do-not-contact list (company/person) enforced on add, draft, and
 * packet." That is three call sites, so the rule lives here as one tested
 * function rather than being re-implemented — and re-diverged — at each one.
 *
 * Matching is exact after normalising case and whitespace. Deliberately NOT a
 * substring match: blocking "Acme" must not also block a different company
 * called "Acme Logistics", and a compliance control that quietly over-blocks
 * gets worked around rather than trusted.
 */

import { cleanName } from "./routing";

function normalise(value: string | null | undefined): string {
  return cleanName(value).toLowerCase();
}

export function isDoNotContact(name: string | null | undefined, list: readonly string[]): boolean {
  const target = normalise(name);
  if (!target) return false;
  return list.some((entry) => normalise(entry) === target);
}
