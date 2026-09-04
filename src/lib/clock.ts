/**
 * Deterministic clock formatting for anything rendered on both sides.
 *
 * `toLocaleTimeString([], …)` resolves the locale and timezone from the host,
 * so the server (UTC on Vercel) and the browser (IST) produced different text
 * for the same instant. React 19 treats that as a hydration mismatch and
 * regenerates the whole tree — and while doing so it clears every attribute on
 * <html>, deleting the `data-theme` the blocking head script had set. The
 * operator's saved theme was thrown away on every page load, every day a sweep
 * had run.
 *
 * So: no Intl, no host timezone, no locale. Just arithmetic on the UTC
 * timestamp, which gives byte-identical output everywhere.
 */

/** India Standard Time. The operator is in India and the sweep cron is TZ=Asia/Kolkata. */
export const IST_OFFSET_MINUTES = 330;

/** `HH:MM` for the given instant, or `""` when there is nothing to show. */
export function formatClock(
  iso: string | null | undefined,
  offsetMinutes: number = IST_OFFSET_MINUTES,
): string {
  if (!iso) return "";

  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";

  const shifted = new Date(ms + offsetMinutes * 60_000);
  const hours = String(shifted.getUTCHours()).padStart(2, "0");
  const minutes = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}
