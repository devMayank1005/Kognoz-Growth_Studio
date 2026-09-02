import Link from "next/link";

import { loadAccountList } from "@/db/queries";
import { requireSession } from "@/lib/session";

/**
 * The account universe (PRD §9.9): everything we know, plus what the radar has
 * found. Sorted by live signal count — the accounts with something happening
 * are the ones worth looking at.
 */
export default async function AccountsPage(props: PageProps<"/accounts">) {
  const session = await requireSession();
  const params = await props.searchParams;

  const status = typeof params.status === "string" ? params.status : null;
  const market = typeof params.market === "string" ? params.market : null;

  const all = await loadAccountList(session.orgId);
  const rows = all.filter(
    (a) => (!status || a.status === status) && (!market || a.country === market),
  );

  const markets = [...new Set(all.map((a) => a.country))].filter((c) => c !== "—").sort();
  const counts = {
    client: all.filter((a) => a.status === "client").length,
    prospect: all.filter((a) => a.status === "prospect").length,
    discovered: all.filter((a) => a.status === "discovered").length,
  };

  return (
    <div className="px-6 py-8">
      <div className="mb-4 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-xl tracking-tight text-body">Accounts</h1>
        <span className="num text-[13px] text-muted">
          {rows.length} of {all.length}
        </span>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        <Chip href="/accounts" active={!status && !market}>All</Chip>
        <Chip href="/accounts?status=client" active={status === "client"}>Clients {counts.client}</Chip>
        <Chip href="/accounts?status=prospect" active={status === "prospect"}>Prospects {counts.prospect}</Chip>
        <Chip href="/accounts?status=discovered" active={status === "discovered"}>New to us {counts.discovered}</Chip>
        <span className="mx-1 w-px bg-line" />
        {markets.map((m) => (
          <Chip key={m} href={`/accounts?market=${encodeURIComponent(m)}`} active={market === m}>{m}</Chip>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead className="sticky top-0 bg-panel">
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-faint">
              <th scope="col" className="h-row px-2 font-medium">Company</th>
              <th scope="col" className="h-row px-2 font-medium">Market</th>
              <th scope="col" className="h-row px-2 font-medium">Industry</th>
              <th scope="col" className="h-row px-2 font-medium">Status</th>
              <th scope="col" className="h-row px-2 text-right font-medium">Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0 hover:bg-panel">
                <td className="h-row px-2">
                  <Link href={`/accounts/${a.id}`} className="font-medium text-body hover:text-accent">
                    {a.name}
                  </Link>
                  {a.inPipeline && <span className="ml-2 text-[11px] text-faint">in pipeline</span>}
                </td>
                <td className="h-row px-2 text-muted">{a.country}</td>
                <td className="h-row px-2 text-muted">{a.industry}</td>
                <td className="h-row px-2"><StatusTag status={a.status} /></td>
                <td className="num h-row px-2 text-right text-body">{a.signalCount || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors duration-150 ${
        active ? "border-cyan text-body" : "border-line text-muted hover:text-body"
      }`}
    >
      {children}
    </Link>
  );
}

/** §9.5 — radar finds carry "new to us"; clients carry "client". */
function StatusTag({ status }: { status: "client" | "prospect" | "discovered" }) {
  if (status === "client") {
    return <span className="rounded-full bg-won-bg px-2 py-0.5 text-[11px] text-won-text">client</span>;
  }
  if (status === "discovered") {
    return <span className="rounded-full border border-cyan px-2 py-0.5 text-[11px] text-cyan">new to us</span>;
  }
  return <span className="text-[11px] text-faint">prospect</span>;
}
