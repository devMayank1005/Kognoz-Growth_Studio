import { assertApiDomain } from "@/domain/zoho/dc";

/**
 * The only module permitted to speak to Zoho's HTTP API.
 *
 * Everything else takes narrowed types from here. That is CONVENTION, not a
 * lint rule — this comment used to claim eslint enforced it, and nothing did.
 * What eslint does enforce is the other half of the boundary: src/domain may
 * not fetch or import an adapter at all, so a raw record cannot reach the
 * mapping layer even by accident. Keeping HTTP in this one module is still on
 * whoever edits it.
 *
 * A rule banning `fetch` outside this file would be the wrong one to write:
 * token.ts and the OAuth callback legitimately call Zoho's *accounts* server,
 * so it would be mostly exemptions.
 *
 * The reason any of it matters is PRD §8: a raw Zoho record carries `Email`, `Phone` and
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

/** Zoho wraps every write in `{ data: [...] }` and answers in kind. */
interface ZohoWriteResponse {
  data?: Array<{
    code?: string;
    status?: string;
    message?: string;
    details?: { id?: string; Modified_Time?: string };
  }>;
}

export interface WrittenRecord {
  id: string;
  /** Present when Zoho reports it, which saves a re-read on the pull leg. */
  modifiedTime: string | null;
}

async function write<T>(
  method: "POST" | "PUT",
  apiDomain: string,
  path: string,
  accessToken: string,
  body: unknown,
): Promise<ZohoResult<T>> {
  const url = `${assertApiDomain(apiDomain)}/crm/v8${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: { status: 0, code: "network", message: (err as Error).message } };
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // Some failures answer with HTML, or nothing.
  }

  if (!response.ok) {
    const obj = (parsed ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      error: {
        status: response.status,
        code: typeof obj.code === "string" ? obj.code : null,
        // Zoho's own message ONLY. An INVALID_DATA response echoes the record
        // back, and for a Contact that echo contains Email and Phone — §8
        // applies to diagnostics too.
        message: typeof obj.message === "string" ? obj.message : response.statusText,
      },
    };
  }

  return { ok: true, data: parsed as T };
}

/**
 * Reads the per-record verdict out of a write response.
 *
 * Zoho returns **HTTP 200 with a per-record failure inside `data[]`** — a
 * record refused for an unknown picklist value does not come back as a 4xx. A
 * caller that only checked the status would record a successful push and store
 * an id that does not exist.
 */
function firstRecord(body: ZohoWriteResponse): ZohoResult<WrittenRecord> {
  const row = body.data?.[0];
  if (!row) {
    return { ok: false, error: { status: 200, code: "EMPTY_RESPONSE", message: "Zoho returned no record." } };
  }
  if (row.status !== "success" || !row.details?.id) {
    return {
      ok: false,
      error: {
        status: 200,
        code: row.code ?? "WRITE_REFUSED",
        message: row.message ?? "Zoho refused the record.",
      },
    };
  }
  return {
    ok: true,
    data: { id: row.details.id, modifiedTime: row.details.Modified_Time ?? null },
  };
}

/** Creates one record. `module` is "Leads" or "Deals". */
export async function createRecord(
  apiDomain: string,
  module: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<ZohoResult<WrittenRecord>> {
  const res = await write<ZohoWriteResponse>("POST", apiDomain, `/${module}`, accessToken, {
    data: [payload],
  });
  return res.ok ? firstRecord(res.data) : res;
}

/**
 * Updates one record we already own.
 *
 * `id` always comes from our own `zohoLeadId`/`zohoDealId` column — never from
 * a search, never matched by name. That is the "only writes to records it
 * created" invariant, and it is enforced by there being no other way to get an
 * id into this function.
 */
export async function updateRecord(
  apiDomain: string,
  module: string,
  id: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<ZohoResult<WrittenRecord>> {
  const res = await write<ZohoWriteResponse>("PUT", apiDomain, `/${module}/${id}`, accessToken, {
    data: [payload],
  });
  return res.ok ? firstRecord(res.data) : res;
}

/*
 * There is deliberately NO delete function in this module, and there never
 * should be. The integration creates and updates; it does not remove. A bug
 * cannot call what does not exist — the same structural argument as `people`
 * having no email column.
 */
