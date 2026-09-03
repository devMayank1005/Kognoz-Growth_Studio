import { toNextJsHandler } from "better-auth/next-js";

import { db } from "@/db/client";
import { authErrors } from "@/db/schema";
import { auth } from "@/lib/auth";

/**
 * Better Auth's route handler, wrapped to record failures.
 *
 * `onAPIError` in auth.ts only fires for THROWN errors. OAuth failures are not
 * thrown — Better Auth answers them with a 302 to `/api/auth/error?error=CODE`,
 * which the browser follows into a redirect loop while showing nothing useful.
 * Verified: a callback with a bogus state produced no `onAPIError` call at all.
 *
 * So the failure is caught here, where it is actually visible: any redirect to
 * the error URL is logged with its code before being passed through. Records the
 * code and path only — never a token, never an address (§8).
 */
const handlers = toNextJsHandler(auth);

/** Entra's token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`. */
const ENTRA_TOKEN_ENDPOINT =
  /^https:\/\/login\.microsoftonline\.com\/[^/]+\/oauth2\/v2\.0\/token$/;

/** Strips anything address-shaped out of a provider message before storing it (§8). */
function redact(text: string): string {
  return text.replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted]");
}

async function recordTokenFailure(status: number, body: string) {
  let code = "unknown";
  let description = body;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const payload = parsed as { error?: string; error_description?: string };
      code = payload.error ?? code;
      description = payload.error_description ?? body;
    }
  } catch {
    // Not JSON. Keep the raw body; it is trimmed below either way.
  }

  // The AADSTS number is the part that names the cause. 7000215 is a bad client
  // secret; 9002327 is a redirect URI registered as a public client (SPA).
  const aadsts = /AADSTS\d+/.exec(description)?.[0];
  const summary = redact(description.split(/[\r\n]/)[0] ?? "").slice(0, 400);

  await db.insert(authErrors).values({
    path: "microsoft token endpoint",
    code: aadsts ?? code,
    message: `http ${status}: ${summary}`,
  });
  console.error("[auth] token exchange failed:", aadsts ?? code, summary);
}

/**
 * Records WHY the Microsoft token exchange failed.
 *
 * A failed exchange reaches the browser as the generic `invalid_code`: Better
 * Auth catches the throw and discards the reason into `logger.error("", e)`
 * (better-auth/dist/api/routes/callback.mjs). That one code cannot tell a bad
 * client secret apart from a redirect URI registered as a public client, so the
 * response is read here, where Microsoft's own AADSTS number is still intact.
 *
 * `@better-fetch` resolves `globalThis.fetch` per request rather than capturing
 * it at import, so wrapping it here is seen by the exchange. Only the Entra
 * token endpoint is touched, only on a non-2xx, and only a CLONE is read — the
 * real response is passed through untouched.
 */
function watchTokenExchange() {
  const scope = globalThis as typeof globalThis & { __gsTokenProbe?: boolean };
  if (scope.__gsTokenProbe) return;
  scope.__gsTokenProbe = true;

  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await original.call(globalThis, input, init);
    try {
      if (response.ok) return response;
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (ENTRA_TOKEN_ENDPOINT.test(url.split("?")[0])) {
        await recordTokenFailure(response.status, await response.clone().text());
      }
    } catch {
      // A diagnostic must never break the request it is describing.
    }
    return response;
  };
}

watchTokenExchange();

async function record(request: Request, response: Response) {
  const location = response.headers.get("location");
  if (!location || !location.includes("/api/auth/error")) return;

  try {
    const code = new URL(location, "http://x").searchParams.get("error");
    await db.insert(authErrors).values({
      path: new URL(request.url).pathname,
      code: code ?? "unknown",
      message: `auth redirected to the error page with code "${code ?? "unknown"}"`,
    });
    console.error("[auth]", new URL(request.url).pathname, "->", code);
  } catch {
    // Diagnostics must never break the request they are describing.
  }
}

export async function GET(request: Request) {
  const response = await handlers.GET(request);
  await record(request, response);
  return response;
}

export async function POST(request: Request) {
  const response = await handlers.POST(request);
  await record(request, response);
  return response;
}
