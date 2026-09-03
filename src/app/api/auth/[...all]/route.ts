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

/**
 * Pulls the readable sentence out of an IIS error page.
 *
 * These pages lead with a DOCTYPE, so keeping the first line — as this did
 * originally — captures nothing but `<!DOCTYPE HTML PUBLIC ...>`. The reason
 * lives in the title, the `<h2>`, and the "HTTP Error" paragraph.
 */
function readableHtml(body: string): string {
  const first = (pattern: RegExp) => pattern.exec(body)?.[1];
  const parts = [
    first(/<title[^>]*>([\s\S]*?)<\/title>/i),
    first(/<h1[^>]*>([\s\S]*?)<\/h1>/i),
    first(/<h2[^>]*>([\s\S]*?)<\/h2>/i),
    ...Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi), (m) => m[1]),
  ].filter((part): part is string => Boolean(part && part.trim()));

  return (parts.length ? parts.join(" | ") : body)
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Header NAMES and byte sizes of the outgoing request — never values.
 *
 * IIS answers an oversized request with exactly this kind of HTML 400, so the
 * sizes are the evidence that confirms or kills that explanation.
 */
function headerInventory(input: RequestInfo | URL, init?: RequestInit): string {
  try {
    const source =
      init?.headers ?? (input instanceof Request ? input.headers : undefined);
    const headers = new Headers(source);
    const parts: string[] = [];
    let total = 0;
    headers.forEach((value, name) => {
      const size = name.length + value.length + 4; // "name: value\r\n"
      total += size;
      parts.push(`${name}:${size}b`);
    });
    return `req-headers ${parts.length} fields ${total}b [${parts.sort().join(" ")}]`;
  } catch {
    return "req-headers unavailable";
  }
}

async function recordTokenFailure(
  url: string,
  response: Response,
  body: string,
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  let code = `html-${response.status}`;
  let description = body;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const payload = parsed as { error?: string; error_description?: string };
      code = payload.error ?? "unknown";
      description = payload.error_description ?? body;
    }
  } catch {
    // Not JSON — an IIS error page. Read the sentence out of it.
    description = readableHtml(body);
  }

  // The AADSTS number names an Entra-level cause (7000215 bad secret, 9002327
  // public-client redirect URI). Its ABSENCE means the request was refused
  // before Entra saw it, and then the HTML text is what matters.
  const aadsts = /AADSTS\d+/.exec(description)?.[0];

  const message = redact(
    [
      `http ${response.status}`,
      `server=${response.headers.get("server") ?? "?"}`,
      `ctype=${response.headers.get("content-type") ?? "?"}`,
      `url=${url}`,
      headerInventory(input, init),
      description,
    ].join(" | "),
  ).slice(0, 1200);

  await db.insert(authErrors).values({
    path: "microsoft token endpoint",
    code: aadsts ?? code,
    message,
  });
  console.error("[auth] token exchange failed:", aadsts ?? code, message);
}

/**
 * Records WHY the Microsoft token exchange failed.
 *
 * A failed exchange reaches the browser as the generic `invalid_code`: Better
 * Auth catches the token exchange throwing and discards the reason into
 * `logger.error("", e)` (better-auth/dist/api/routes/callback.mjs).
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
        await recordTokenFailure(
          url,
          response,
          await response.clone().text(),
          input,
          init,
        );
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
