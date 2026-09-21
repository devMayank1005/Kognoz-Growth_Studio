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

/** The four roles from PRD §1, mirrored here so this module stays I/O-free. */
export type AccessRole = "operator" | "partner" | "viewer" | "admin";

/**
 * What each role may do — PRD §1's table, turned into something the server can
 * check.
 *
 * Before this there was one predicate, `canManageIntegrations`, called at four
 * sites. Twenty-two of the twenty-five server actions were therefore role-blind,
 * including `removeFromDnc` — so any signed-in user could delete a
 * do-not-contact entry, and the DNC gate in this same layer would then correctly
 * wave the next add through. A server action is a public endpoint: a hidden
 * button is not a control, and for the DNC list the button was not even hidden.
 */
export type Permission =
  /** Connect or disconnect Zoho, flip dry run, set the dropbox. §1: Admin; Operator "keep Zoho true". */
  | "manageIntegrations"
  /** Partners, towers, ICP, radar markets, call budget, FX rate, display currency. §1: Admin. */
  | "manageSettings"
  /** The do-not-contact list. §1 gives Admin "DNC"; §8 makes it a hard rule. */
  | "manageCompliance"
  /** Add cards, move stages, draft, dispatch, record outcomes, dismiss signals. §1: Operator. */
  | "managePipeline";

/**
 * **Operator is granted everything, deliberately** — the same reasoning
 * `canManageIntegrations` has always carried. `DEFAULT_ROLE` in
 * `src/lib/session.ts` is "operator" and nothing in this codebase ever writes
 * "admin", so withholding a permission from operator locks out every existing
 * user including the founder, and presents as a broken feature rather than as a
 * permission decision. Tighten when a real admin role exists and someone holds it.
 *
 * Partner gets the pipeline only — §1: "draft/send notes under own name; log
 * outcomes". Viewer gets nothing — §1: "Dashboard and revenue math only".
 * Neither role is ever written today, so both are statements of intent.
 */
/**
 * A Map, not an object literal, because the key is untrusted.
 *
 * `member.role` is plain text with no CHECK constraint and
 * `resolveStudioSession` passes whatever it holds straight through, so the
 * lookup key can be any string. On an object, `ROLE_PERMISSIONS["__proto__"]`
 * resolves to `Object.prototype` — truthy, without `.includes` — so `can()`
 * threw a TypeError instead of denying. A thrown guard does refuse, but as an
 * unhandled 500 with no message, and "fails closed" has to mean `false`.
 * `Map.get` returns undefined for every key nobody put in it.
 */
const ROLE_PERMISSIONS = new Map<AccessRole, readonly Permission[]>([
  ["admin", ["manageIntegrations", "manageSettings", "manageCompliance", "managePipeline"]],
  ["operator", ["manageIntegrations", "manageSettings", "manageCompliance", "managePipeline"]],
  ["partner", ["managePipeline"]],
  ["viewer", []],
]);

/** Fails closed: an unrecognised role gets nothing. */
export function can(role: AccessRole | string, permission: Permission): boolean {
  return ROLE_PERMISSIONS.get(role as AccessRole)?.includes(permission) ?? false;
}

/**
 * Who may wire this workspace to an external system.
 *
 * Kept as a named predicate because three call sites and a route read better for
 * it, and because its own reasoning is worth keeping next to the thing it gates.
 * Delegates now, so there is one table to change.
 */
export function canManageIntegrations(role: AccessRole | string): boolean {
  return can(role, "manageIntegrations");
}
