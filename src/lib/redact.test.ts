import { describe, expect, it } from "vitest";

import { redactSecrets } from "./redact";

describe("redactSecrets", () => {
  /**
   * The production incident, verbatim. On 2026-09-03 a pasted ANTHROPIC_API_KEY
   * carried a comment line out of .env, the SDK threw with the key inside the
   * message, and `logModelCall` stored it — putting a live credential into
   * eleven database rows and into every pg_dump taken afterwards.
   */
  it("removes an Anthropic key from an SDK error message", () => {
    const message =
      'Headers.append: "sk-ant-api03-YwhQ76a6mvs1UuLF9zSY1afW6uPPbFj_5MjjdH66eP1fWUzuAKa\n\n# ---- Better Auth ----" is an invalid header value.';
    const out = redactSecrets(message);
    expect(out).not.toContain("sk-ant-");
    expect(out).not.toContain("YwhQ76a6");
    expect(out).toContain("[redacted]");
    // The diagnosis must survive — that is the whole point of logging it.
    expect(out).toContain("is an invalid header value");
  });

  it("removes an Inngest signing key", () => {
    const out = redactSecrets("bad key signkey-prod-07b96bd9a02825847fc7a349178dab49 rejected");
    expect(out).not.toContain("07b96bd9");
    expect(out).toContain("[redacted]");
  });

  it("removes the password from a Postgres connection string", () => {
    const out = redactSecrets("connect failed: postgresql://neondb_owner:npg_S3cretPw@ep-x.aws.neon.tech/db");
    expect(out).not.toContain("npg_S3cretPw");
    expect(out).toContain("neondb_owner");
    expect(out).toContain("ep-x.aws.neon.tech");
  });

  it("removes a bearer token", () => {
    const out = redactSecrets("401 from Authorization: Bearer abc123def456ghi789jkl");
    expect(out).not.toContain("abc123def456ghi789jkl");
  });

  it("leaves an ordinary error untouched", () => {
    const message = "Request timed out.";
    expect(redactSecrets(message)).toBe(message);
  });

  it("keeps ordinary hyphenated words intact", () => {
    const message = "could not reach api-gateway-01 in region us-east-2";
    expect(redactSecrets(message)).toBe(message);
  });

  it("caps runaway output so one error cannot fill the table", () => {
    const out = redactSecrets("x".repeat(5000)) ?? "";
    expect(out.length).toBeLessThanOrEqual(520);
    expect(out.endsWith("…")).toBe(true);
  });

  it("handles null and undefined without throwing", () => {
    expect(redactSecrets(undefined)).toBeUndefined();
    expect(redactSecrets(null)).toBeUndefined();
  });

  it("collapses newlines so a multi-line paste cannot smuggle content through", () => {
    expect(redactSecrets("line one\nline two")).toBe("line one line two");
  });
});
