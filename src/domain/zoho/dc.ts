/**
 * Zoho's data centres.
 *
 * Zoho is region-sharded and **a token is not portable across data centres** —
 * one issued at `.in` returns 401 at `.com`'s API domain with nothing in the
 * error that says why. So the region is part of the connection, not a constant.
 *
 * Note there is deliberately NO api domain in this table. Canada's accounts
 * host is `accounts.zohocloud.ca`, not `zoho.ca`, which proves the pattern is
 * not derivable; the API domain is only ever what Zoho returns in the token
 * response. This map exists to pick a STARTING point for the authorize leg and
 * to gate anything before it reaches a URL — nothing more.
 */

export const ZOHO_DCS = {
  us: { accounts: "https://accounts.zoho.com", crm: "crm.zoho.com", label: "United States" },
  eu: { accounts: "https://accounts.zoho.eu", crm: "crm.zoho.eu", label: "Europe" },
  in: { accounts: "https://accounts.zoho.in", crm: "crm.zoho.in", label: "India" },
  au: { accounts: "https://accounts.zoho.com.au", crm: "crm.zoho.com.au", label: "Australia" },
  jp: { accounts: "https://accounts.zoho.jp", crm: "crm.zoho.jp", label: "Japan" },
  ca: { accounts: "https://accounts.zohocloud.ca", crm: "crm.zohocloud.ca", label: "Canada" },
  sa: { accounts: "https://accounts.zoho.sa", crm: "crm.zoho.sa", label: "Saudi Arabia" },
  cn: { accounts: "https://accounts.zoho.com.cn", crm: "crm.zoho.com.cn", label: "China" },
} as const;

export type ZohoDc = keyof typeof ZOHO_DCS;

export const ZOHO_DC_CODES = Object.keys(ZOHO_DCS) as ZohoDc[];

export function isZohoDc(value: string): value is ZohoDc {
  return Object.prototype.hasOwnProperty.call(ZOHO_DCS, value);
}

export function dcLabel(dc: ZohoDc): string {
  return ZOHO_DCS[dc].label;
}

/** Maps an `accounts-server` value Zoho returned back to a region code. */
export function dcFromAccountsDomain(url: string): ZohoDc | null {
  const clean = url.trim().replace(/\/+$/, "").toLowerCase();
  for (const code of ZOHO_DC_CODES) {
    if (ZOHO_DCS[code].accounts === clean) return code;
  }
  return null;
}

/**
 * Allowlist gate for any accounts domain about to be interpolated into a URL.
 *
 * This is the `MICROSOFT_TENANT_ID` lesson (src/lib/auth.ts) applied to the
 * same class of footgun: a value with a stray newline built a URL Microsoft
 * refused before Entra ever saw it, and the only symptom was a sign-in loop.
 * Checking the shape at the boundary turns that into a message that names the
 * problem.
 */
export function assertAccountsDomain(url: string): string {
  const clean = url.trim().replace(/\/+$/, "");
  if (dcFromAccountsDomain(clean) === null) {
    throw new Error(
      `"${clean}" is not a Zoho accounts domain. Expected one of: ` +
        ZOHO_DC_CODES.map((c) => ZOHO_DCS[c].accounts).join(", "),
    );
  }
  return clean;
}

/**
 * Every domain Zoho is known to serve from.
 *
 * A HOST MUST EQUAL ONE OF THESE OR END WITH "." PLUS ONE OF THEM. Suffix
 * matching without that dot boundary is the classic hole: an earlier version of
 * this used /zohoapis\.[a-z.]+$/ and happily accepted
 * `zohoapis.in.evil.com`, which would have sent the access token — and every
 * subsequent CRM call — to somebody else's server.
 */
const ZOHO_BASE_DOMAINS = [
  "zoho.com", "zohoapis.com",
  "zoho.eu", "zohoapis.eu",
  "zoho.in", "zohoapis.in",
  "zoho.com.au", "zohoapis.com.au",
  "zoho.jp", "zohoapis.jp",
  "zohocloud.ca", "zohoapis.ca",
  "zoho.sa", "zohoapis.sa",
  "zoho.com.cn", "zohoapis.com.cn",
] as const;

function isZohoHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return ZOHO_BASE_DOMAINS.some((base) => host === base || host.endsWith(`.${base}`));
}

/**
 * Guards an `api_domain` from a token response before it is stored.
 *
 * Deliberately not matched against a fixed list of API hosts — that host is not
 * derivable from the region code (Canada's accounts host is
 * `accounts.zohocloud.ca`), and hardcoding one would break the moment Zoho adds
 * a region. So this checks what can honestly be checked: https, and a host
 * Zoho actually owns.
 *
 * If Zoho ever returns a domain outside the list, the error names the host, so
 * it is a one-line fix rather than a mystery.
 */
export function assertApiDomain(url: string): string {
  const clean = url.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    throw new Error(`Zoho returned an api_domain that is not a URL: "${clean}"`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Zoho returned a non-https api_domain: "${clean}"`);
  }
  if (!isZohoHost(parsed.hostname)) {
    throw new Error(
      `Zoho returned an api_domain on a host this app does not recognise: "${parsed.hostname}". ` +
        "If Zoho has added a data centre, add its domain to ZOHO_BASE_DOMAINS in src/domain/zoho/dc.ts.",
    );
  }
  return `${parsed.protocol}//${parsed.host}`;
}
