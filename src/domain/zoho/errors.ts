/**
 * What a failed Zoho call actually means.
 *
 * Pure and tested because the obvious reading of it is wrong, and the wrong
 * reading is expensive. Zoho returns **HTTP 401 with `OAUTH_SCOPE_MISMATCH`**
 * when a scope is missing — not the 403 you would expect — so branching on the
 * status alone reports a scope problem as a bad token, and sends whoever is
 * debugging it into data-centre settings for a problem that has nothing to do
 * with them. Verified against the live API, not assumed.
 */

export interface ZohoErrorShape {
  status: number;
  code: string | null;
  message: string;
}

export type ZohoFailure =
  /** The grant is missing a scope. Fixed by re-consenting, not by reconnecting to a different region. */
  | "scope"
  /** The token is not valid here — most often the wrong data centre. */
  | "auth"
  /** Zoho refused the data: an unknown picklist value, a missing mandatory field. */
  | "data"
  /** Too many requests. Back off; do not count it toward disabling a connection. */
  | "throttled"
  /** Zoho's problem, or the network's. Retry. */
  | "transient"
  | "unknown";

const SCOPE_CODES = new Set(["OAUTH_SCOPE_MISMATCH", "INVALID_SCOPE"]);
const DATA_CODES = new Set([
  "INVALID_DATA", "MANDATORY_NOT_FOUND", "DUPLICATE_DATA", "INVALID_MODULE", "NOT_SUPPORTED",
]);

export function classifyZohoError(error: ZohoErrorShape): ZohoFailure {
  // The CODE first, always — the status is the part that misleads.
  if (error.code && SCOPE_CODES.has(error.code)) return "scope";
  if (error.code && DATA_CODES.has(error.code)) return "data";
  if (error.code === "INVALID_TOKEN" || error.code === "AUTHENTICATION_FAILURE") return "auth";

  if (error.status === 429) return "throttled";
  if (error.status === 403) return "scope";
  if (error.status === 401) return "auth";
  if (error.status >= 500 || error.status === 0) return "transient";
  return "unknown";
}

/**
 * Does this failure spend one of a card's five strikes?
 *
 * The rule is written into `ZohoFailure` above — *"throttled: Back off; do not
 * count it toward disabling a connection"* — and `src/lib/zoho/token.ts:178-180`
 * has always obeyed it for `zoho_connections.refresh_failures`. The counter on
 * `opportunities.zoho_sync_attempts` never did, so a 429 marched healthy cards
 * toward quarantine: Inngest retries three times, so one throttled push could
 * take four strikes, and nothing clears `zoho_blocked_at` except a successful
 * push the card is by then excluded from attempting.
 *
 * `transient` is included for the same reason the token path includes it — "a
 * network blip or a 429" is not evidence about the payload.
 *
 * `data` never reaches this decision: `pushCard` blocks a data refusal outright
 * rather than counting it, because it will not succeed on a retry.
 */
export function spendsStrike(kind: ZohoFailure): boolean {
  return kind !== "throttled" && kind !== "transient";
}

/** A sentence the operator can act on. Never echoes a record — PRD §8. */
export function describeZohoError(error: ZohoErrorShape): string {
  switch (classifyZohoError(error)) {
    case "scope":
      return "Growth Studio was not granted the scope this needs. Disconnect and connect again to re-consent.";
    case "auth":
      return "Zoho refused the token. If this is a new connection, it is most likely the wrong data centre.";
    case "data":
      return `Zoho refused the data: ${error.code ?? error.message}.`;
    case "throttled":
      return "Zoho is rate limiting us. It will retry shortly.";
    case "transient":
      return "Zoho did not answer. Try again shortly.";
    default:
      return `${error.status}${error.code ? ` ${error.code}` : ""} — ${error.message}`;
  }
}
