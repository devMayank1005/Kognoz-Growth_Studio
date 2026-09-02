/**
 * Who may have a workspace.
 *
 * This is the second of two independent access controls. The first is the
 * Entra tenant lock (MICROSOFT_TENANT_ID), which stops anyone outside the
 * Kognoz directory authenticating at all. This one additionally excludes
 * TENANT GUESTS — people invited into the directory who keep their own address
 * — because a guest invited to a Teams channel should not thereby be able to
 * read the whole pipeline.
 *
 * The allowlist is configuration, never a database row: an access control that
 * can be widened from inside the application is a privilege-escalation path.
 */

/**
 * Exact match on the domain, never `endsWith`.
 *
 * `endsWith` would admit `evilkognozconsulting.com`, which anyone can register.
 * Everything here fails closed: a malformed address, a missing address, or an
 * empty allowlist all deny.
 */
export function isAllowedEmailDomain(
  email: string | null | undefined,
  allowedDomains: readonly string[],
): boolean {
  if (allowedDomains.length === 0) return false;

  const address = String(email ?? "").trim().toLowerCase();
  if (!address) return false;

  // Exactly one "@". Anything else is malformed — do not guess which part is
  // the domain.
  const parts = address.split("@");
  if (parts.length !== 2) return false;

  const [localPart, domain] = parts;
  if (!localPart || !domain) return false;

  return allowedDomains.some((allowed) => allowed.trim().toLowerCase() === domain);
}

/** Reads the comma-separated ALLOWED_EMAIL_DOMAINS value into a clean list. */
export function parseAllowedDomains(raw: string | null | undefined): string[] {
  return String(raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}
