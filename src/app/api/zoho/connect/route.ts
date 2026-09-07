import { NextResponse } from "next/server";

import { canManageIntegrations } from "@/domain/access";
import { dcFromAccountsDomain, isZohoDc, ZOHO_DC_CODES } from "@/domain/zoho/dc";
import { getStudioSession } from "@/lib/session";
import { accountsDomainFor, buildAuthorizeUrl, zohoConfigError } from "@/lib/zoho/config";
import {
  encodeState, newNonce, stateCookieName, stateCookieOptions, STATE_TTL_SECONDS,
} from "@/lib/zoho/state";

export const dynamic = "force-dynamic";

/**
 * Starts the Zoho consent flow (PRD §6, §9.10).
 *
 * A GET that ends in a browser redirect to Zoho, reached from an `<a>` in
 * Settings — not a `fetch`. The browser has to actually navigate.
 *
 * Deliberately NOT routed through `proxy.ts`: that redirects cookie-less
 * requests to /sign-in, and doing so on the callback leg would discard a
 * short-lived authorization code. Auth is enforced here, where the failure can
 * be described.
 */
export async function GET(request: Request) {
  const session = await getStudioSession();

  // A real browser navigation, so a 302 is right — unlike the JSON 401 the
  // fetch-based routes return. Built explicitly rather than thrown through
  // `redirect()`, which src/lib/session.ts forbids in a Route Handler.
  if (!session) {
    return NextResponse.redirect(new URL("/sign-in?next=/settings", request.url));
  }

  if (!canManageIntegrations(session.role)) {
    return NextResponse.redirect(new URL("/settings?zoho=forbidden", request.url));
  }

  if (zohoConfigError) {
    console.error(`[zoho] connect refused: ${zohoConfigError}`);
    return NextResponse.redirect(new URL("/settings?zoho=misconfigured", request.url));
  }

  // An unrecognised region is a 400 naming the valid codes, never a silent
  // fallback to a data centre the operator did not choose.
  const requested = new URL(request.url).searchParams.get("dc");
  if (requested && !isZohoDc(requested)) {
    return Response.json(
      { error: "bad-request", message: `Unknown data centre "${requested}".`, valid: ZOHO_DC_CODES },
      { status: 400 },
    );
  }

  const accountsDomain = accountsDomainFor(requested);
  const dc = dcFromAccountsDomain(accountsDomain) ?? "us";
  const nonce = newNonce();

  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(accountsDomain, nonce);
  } catch (err) {
    console.error("[zoho] could not build the authorize URL", err);
    return NextResponse.redirect(new URL("/settings?zoho=misconfigured", request.url));
  }

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(
    stateCookieName(),
    encodeState({ nonce, orgId: session.orgId, userId: session.userId, dc }),
    stateCookieOptions(STATE_TTL_SECONDS),
  );
  return response;
}
