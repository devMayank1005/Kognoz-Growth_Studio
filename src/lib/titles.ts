/**
 * How a conversation gets its name.
 *
 * Pure, and deliberately not in `db/conversations.ts`: that module imports the
 * database client, so a unit test for this would have needed a live
 * `DATABASE_URL` to check string truncation.
 */

/** Titles come from the first thing asked, so the switcher reads like the work. */
export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "New conversation";
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean;
}
