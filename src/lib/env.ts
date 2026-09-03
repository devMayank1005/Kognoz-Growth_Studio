/**
 * Reading environment variables without inheriting whatever the paste carried.
 *
 * A trailing newline on `MICROSOFT_TENANT_ID` in Vercel put a control character
 * into the middle of Microsoft's token endpoint URL
 * (`.../{tenant}%0A/oauth2/v2.0/token`), which their front end rejects as an
 * invalid URL before Entra ever sees the request. The symptom was a sign-in
 * redirect loop with no usable error anywhere.
 *
 * It hid because the two OAuth legs disagree: `createAuthorizationURL()` builds
 * a `URL`, and the WHATWG parser strips tab/LF/CR from its input, so the
 * authorize step was clean and Microsoft's own sign-in screen appeared as
 * normal. The token endpoint is passed to `betterFetch` as a raw string, where
 * the newline survives.
 *
 * So: no env value gets to keep leading or trailing whitespace, in either its
 * literal or percent-encoded form. Only the ends are touched — the interior of
 * a secret is never rewritten.
 */

/** Whitespace at either end, literal (`\n`) or percent-encoded (`%0A`). */
const EDGE_WHITESPACE = /^(?:\s|%0[AD]|%09)+|(?:\s|%0[AD]|%09)+$/gi;

export function sanitizeEnvValue(raw: string): string {
  return raw.replace(EDGE_WHITESPACE, "");
}

/** Warn once per variable — this runs per request, and repetition is noise. */
const warned = new Set<string>();

/**
 * Reads an environment variable, sanitized. Returns `undefined` when it is
 * unset or holds nothing but whitespace, so `??` and `||` defaults behave.
 */
export function readEnv(name: string): string | undefined {
  const raw = process.env[name];
  if (raw === undefined) return undefined;

  const value = sanitizeEnvValue(raw);
  if (value !== raw && !warned.has(name)) {
    warned.add(name);
    console.warn(
      `[env] ${name} had leading or trailing whitespace, which has been ignored. ` +
        `Fix the value at source — a stray newline breaks URLs and HTTP headers.`,
    );
  }
  return value === "" ? undefined : value;
}

/** As `readEnv`, but refuses to continue without a value. */
export function requireEnv(name: string, hint?: string): string {
  const value = readEnv(name);
  if (value === undefined) {
    throw new Error(
      `${name} is not set (or is empty).${hint ? ` ${hint}` : " It is required."}`,
    );
  }
  return value;
}
