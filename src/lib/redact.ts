/**
 * Strips credentials out of anything on its way into the database.
 *
 * On 2026-09-03 a pasted `ANTHROPIC_API_KEY` carried a comment line out of
 * `.env`, so the SDK threw `Headers.append: "sk-ant-…" is an invalid header
 * value` — and `logModelCall` stored that message verbatim. The live key ended
 * up in eleven `model_calls` rows, readable to anyone with database access and
 * copied into every `pg_dump` taken afterwards.
 *
 * An error message is diagnostic. It is not a place for a credential, and it is
 * not a place for unbounded provider output either, so this also collapses
 * newlines and caps the length.
 */

const PATTERNS: Array<[RegExp, string]> = [
  // Anthropic keys. The character class stops at the quote/newline that ended
  // the key in the incident above.
  [/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]"],
  // Inngest signing keys (prod and test).
  [/signkey-(?:prod|test)-[A-Za-z0-9]+/g, "[redacted]"],
  // Anything shaped like an OpenAI-style key, in case a provider is ever added.
  [/\bsk-[A-Za-z0-9]{20,}/g, "[redacted]"],
  // Password inside a connection string — keep the user and host, they are the
  // diagnostic part.
  [/(:\/\/[^:/\s@]+:)[^@\s]+(@)/g, "$1[redacted]$2"],
  // Authorization headers.
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted]"],
];

const MAX = 500;

/**
 * Returns the text with credentials replaced, newlines collapsed and length
 * capped. `undefined` in, `undefined` out, so call sites can pass an optional
 * error straight through.
 */
export function redactSecrets(text: string | null | undefined): string | undefined {
  if (text === null || text === undefined) return undefined;

  let out = String(text);
  for (const [pattern, replacement] of PATTERNS) out = out.replace(pattern, replacement);

  out = out.replace(/\s*[\r\n]+\s*/g, " ").trim();
  return out.length > MAX ? `${out.slice(0, MAX)}…` : out;
}
