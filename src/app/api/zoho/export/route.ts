import { loadPipeline } from "@/db/queries";
import { dealsCsv, leadsCsv, splitForExport } from "@/domain/zoho/csv";
import { LEAD_SOURCE } from "@/domain/zoho/fields";
import { loadMoneyView } from "@/lib/money-view";
import { toSyncCard } from "@/lib/zoho/card";
import { getStudioSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The CSV fallback (PRD §6: "CSV export (Leads + Deals files) remains
 * available").
 *
 * Shipped before the API sync deliberately. It uses the same field mapper the
 * API path will use, so opening these files is how the mapping gets proved
 * against the real pipeline — with no possibility of damaging a live CRM.
 */
export async function GET(request: Request) {
  const session = await getStudioSession();
  if (!session) {
    // 401 rather than a redirect, matching the other route handlers: a redirect
    // would hand the caller the sign-in page's HTML.
    return Response.json(
      { error: "signed-out", message: "Your session has ended. Sign in again." },
      { status: 401 },
    );
  }

  const kind = new URL(request.url).searchParams.get("kind") ?? "deals";
  if (kind !== "leads" && kind !== "deals") {
    return Response.json(
      { error: "bad-request", message: 'kind must be "leads" or "deals".' },
      { status: 400 },
    );
  }

  const cards = (await loadPipeline(session.orgId)).map(toSyncCard);
  const { leads, deals } = splitForExport(cards);

  const today = new Date();
  const stamp = today.toISOString().slice(0, 10);
  // The CSV is the same mapping the API sync uses, so it must state the same
  // currency — an export that says $ while the sync sends ₹ is two sources of
  // truth for one number.
  const money = await loadMoneyView(session.orgId);
  const body = kind === "leads" ? leadsCsv(leads, LEAD_SOURCE, money.base) : dealsCsv(deals, today);

  return new Response(body, {
    headers: {
      // charset matters: account names carry em dashes and Arabic transliteration.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zoho-${kind}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
