/**
 * The shapes PRD §8 forbids, defined once.
 *
 * §8 is enforced in three places that must agree: the `people` table has no
 * contact columns, `scripts/check-compliance` greps the live schema for column
 * names, and — once Zoho data starts arriving — the sync boundary has to reject
 * anything contact-shaped before it reaches Postgres.
 *
 * Those three used to be able to drift, because the CI script had its own copy
 * of the pattern. This module is the single definition; the script imports it,
 * so a test cannot pass against a weaker pattern than CI enforces.
 */

/**
 * Column and property names that look like personal contact data.
 *
 * Wider than the original CI pattern, which matched only
 * `email|phone|mobile|address|linkedin|twitter|whatsapp` and therefore let
 * `e_mail`, `Home_Phone`, `tel`, `msisdn`, `Mailing_Street` and `Mailing_Zip`
 * through — all of which are real Zoho field names.
 */
const word = (token: string): string => `(?<![a-z])${token}(?![a-z])`;

export const CONTACT_SHAPED_KEY = new RegExp(
  [
    // Substrings are enough: no legitimate column contains these by accident.
    "e[-_]?mail", "phone", "mobile", "msisdn",
    "address", "street", "postcode",
    "linkedin", "twitter", "whatsapp", "skype",
    // Short tokens need boundaries or they fire on "excellent" and "hotel".
    // The boundaries are LOOKAROUNDS, not `\b`: `_` is a word character, so
    // `\bzip\b` never matches `Mailing_Zip` — and `Mailing_Zip`, `Cell_Phone`
    // and `Other_Fax` are the actual Zoho field names this must catch.
    word("mail"), word("cell"), word("tel(?:ephone)?"), word("fax"), word("zip"),
  ].join("|"),
  "i",
);

/**
 * Values that look like an address or a phone number, for `jsonb` columns where
 * the key can be perfectly innocuous. `activities.payloadJson` is untyped, so a
 * key check alone would not stop `{ note: "reach him on +971 50 123 4567" }`.
 *
 * A phone number is a run of digits that is EITHER internationally prefixed OR
 * broken up by separators. A bare unbroken run is deliberately not matched,
 * because Zoho record ids are exactly that — `554023000000123456` — and an
 * earlier `\+?\d[\d\s().-]{8,}\d` rejected every record the sync fetched.
 *
 * The cost of that precision is that a separator-free `971507654321` reads as
 * an id and passes. That is accepted: this scan is the backstop, and the
 * controls that actually carry the guarantee are the `fields=` request scoping
 * and the explicit pick in `from-zoho.ts`.
 */
export const CONTACT_SHAPED_VALUE = new RegExp(
  [
    // an email address
    String.raw`[\w.+-]+@[\w-]+\.[\w.]{2,}`,
    // +971 4 708 1234, +971-50-123-4567, (+971) 4 708 1234
    String.raw`\+\d[\d\s().-]{7,}\d`,
    // 971 4 708 1234 — no prefix, but separated
    String.raw`\d{2,}[\s().-][\d\s().-]{5,}\d`,
  ].join("|"),
);

/** Where a forbidden key or value was found, without ever quoting the value. */
export class ContactDataError extends Error {
  constructor(
    readonly where: string,
    readonly path: string,
    readonly kind: "key" | "value",
  ) {
    // Deliberately names the PATH and never the value: this message ends up in
    // logs and in `zoho_sync_errors`, and printing the address to prove we
    // caught the address would be the leak we are preventing.
    super(`${where}: ${kind} at "${path}" looks like personal contact data (PRD §8)`);
    this.name = "ContactDataError";
  }
}

function walk(
  value: unknown,
  where: string,
  path: string,
  checkKeys: boolean,
  checkValues: boolean,
  depth: number,
): void {
  // Bounded: a cyclic or absurdly nested object must not hang the sync.
  if (depth > 12) return;

  if (typeof value === "string") {
    if (checkValues && CONTACT_SHAPED_VALUE.test(value)) {
      throw new ContactDataError(where, path, "value");
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, where, `${path}[${i}]`, checkKeys, checkValues, depth + 1));
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      if (checkKeys && CONTACT_SHAPED_KEY.test(key)) {
        throw new ContactDataError(where, path ? `${path}.${key}` : key, "key");
      }
      walk(v, where, path ? `${path}.${key}` : key, checkKeys, checkValues, depth + 1);
    }
  }
}

/** Throws if any property name anywhere in `o` is contact-shaped. */
export function assertNoContactShapedKeys(o: unknown, where: string): void {
  walk(o, where, "", true, false, 0);
}

/** Throws if any string anywhere in `o` looks like an address or phone number. */
export function assertNoContactShapedValues(o: unknown, where: string): void {
  walk(o, where, "", false, true, 0);
}

/**
 * Both checks. Every object on its way into Postgres from the Zoho leg goes
 * through this — including anything destined for `activities.payloadJson`.
 */
export function assertNoContactData(o: unknown, where: string): void {
  walk(o, where, "", true, true, 0);
}
