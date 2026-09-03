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
