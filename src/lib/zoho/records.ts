import { assertApiDomain } from "@/domain/zoho/dc";

/**
 * The only module permitted to speak to Zoho's HTTP API.
 *
 * Everything else takes narrowed types from here. That is enforced by eslint,
 * and the reason is PRD §8: a raw Zoho record carries `Email`, `Phone` and
 * `Mobile`, and `activities.payloadJson` is untyped `jsonb` — so "someone logs
 * the raw response for debugging" is one line away from putting personal
 * contact data into Postgres and into every `pg_dump`.
 */

/** Bounded so a hung Zoho call cannot hold a pooled database connection. */
const TIMEOUT_MS = 15_000;

export interface ZohoApiError {
  status: number;
  code: string | null;
  message: string;
}

export type ZohoResult<T> = { ok: true; data: T } | { ok: false; error: ZohoApiError };

/**
 * One GET against the CRM API.
 *
 * `fields` is passed by callers that read records, so personal data never
 * crosses the network in the first place — layer 0 of the §8 boundary.
 */
export async function zohoGet<T>(
  apiDomain: string,
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<ZohoResult<T>> {
  const url = new URL(`${assertApiDomain(apiDomain)}/crm/v8${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    return {
      ok: false,
      error: { status: 0, code: "network", message: (err as Error).message },
    };
  }

  // 204 is Zoho's "no content" for an empty result set — not an error.
  if (response.status === 204) return { ok: true, data: {} as T };

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Some failures return HTML or nothing at all.
  }

  if (!response.ok) {
    const obj = (body ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      error: {
        status: response.status,
        code: typeof obj.code === "string" ? obj.code : null,
        // Zoho's own message only. NEVER the echoed record — an INVALID_DATA
        // error repeats the record back, and for a Contact that includes Email.
        message: typeof obj.message === "string" ? obj.message : response.statusText,
      },
    };
  }

  return { ok: true, data: body as T };
}
