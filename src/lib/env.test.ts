import { afterEach, describe, expect, it, vi } from "vitest";

import { readEnv, readSecret, requireEnv, sanitizeEnvValue } from "./env";

/**
 * A fresh variable name per test: `readEnv` warns only once per variable by
 * design (it runs on every request, and repetition is noise), so sharing one
 * name would make these order-dependent.
 */
let n = 0;
const used: string[] = [];
function key() {
  const name = `GS_ENV_TEST_${++n}`;
  used.push(name);
  return name;
}

afterEach(() => {
  for (const name of used.splice(0)) delete process.env[name];
  vi.restoreAllMocks();
});

describe("sanitizeEnvValue", () => {
  it("leaves a clean value untouched", () => {
    expect(sanitizeEnvValue("2dbb05c9-b19f-4164-bc87-9a3f87e7d02e")).toBe(
      "2dbb05c9-b19f-4164-bc87-9a3f87e7d02e",
    );
  });

  it("strips a trailing newline", () => {
    expect(sanitizeEnvValue("tenant\n")).toBe("tenant");
  });

  it("strips surrounding whitespace", () => {
    expect(sanitizeEnvValue("  tenant \t")).toBe("tenant");
  });

  /**
   * The production failure: the value reached the token endpoint URL as
   * `.../{tenant}%0A/oauth2/v2.0/token`, which Microsoft rejects as an invalid
   * URL before Entra ever sees the request.
   */
  it("strips a percent-encoded newline at the end", () => {
    expect(sanitizeEnvValue("tenant%0A")).toBe("tenant");
  });

  it("strips percent-encoded carriage return and tab, in either case", () => {
    expect(sanitizeEnvValue("tenant%0D")).toBe("tenant");
    expect(sanitizeEnvValue("tenant%09")).toBe("tenant");
    expect(sanitizeEnvValue("tenant%0a")).toBe("tenant");
  });

  it("strips a mixture at both ends", () => {
    expect(sanitizeEnvValue("%0A  tenant\r\n%0D")).toBe("tenant");
  });

  /** A client secret may legitimately contain ~ . - _ and even a % sequence. */
  it("never alters the interior of a value", () => {
    expect(sanitizeEnvValue("abc8Q~x.y-z_1")).toBe("abc8Q~x.y-z_1");
    expect(sanitizeEnvValue("a%0Ab")).toBe("a%0Ab");
  });

  it("reduces a whitespace-only value to empty", () => {
    expect(sanitizeEnvValue(" \n%0A\t ")).toBe("");
  });
});

describe("readEnv", () => {
  it("returns undefined when the variable is unset", () => {
    expect(readEnv(key())).toBeUndefined();
  });

  it("returns undefined when the value is only whitespace", () => {
    const k = key();
    process.env[k] = "  \n ";
    expect(readEnv(k)).toBeUndefined();
  });

  it("returns the sanitized value", () => {
    const k = key();
    process.env[k] = "tenant%0A";
    expect(readEnv(k)).toBe("tenant");
  });

  it("warns, naming the variable, so the dirty value gets fixed at source", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    process.env[k] = "tenant\n";
    readEnv(k);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(k);
  });

  it("warns only once per variable, however often it is read", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    process.env[k] = "tenant\n";
    readEnv(k);
    readEnv(k);
    readEnv(k);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not warn for a clean value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    process.env[k] = "tenant";
    readEnv(k);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("requireEnv", () => {
  it("returns the sanitized value", () => {
    const k = key();
    process.env[k] = " tenant\n";
    expect(requireEnv(k)).toBe("tenant");
  });

  it("throws naming the variable when absent", () => {
    const k = key();
    expect(() => requireEnv(k)).toThrow(k);
  });

  it("includes the caller's hint in the error", () => {
    const k = key();
    expect(() => requireEnv(k, "Copy .env.example.")).toThrow("Copy .env.example.");
  });
});

describe("readSecret", () => {
  it("returns a clean key untouched", () => {
    const k = key();
    process.env[k] = "sk-ant-api03-abc123";
    expect(readSecret(k)).toBe("sk-ant-api03-abc123");
  });

  /**
   * The production failure, verbatim. Pasting into Vercel selected past the end
   * of the key and swallowed the next section header of the .env file, so the
   * SDK threw `Headers.append: … is an invalid header value` on every call and
   * the whole engine went down.
   *
   * A newline cannot appear in an HTTP header value, so nothing after one could
   * ever have been part of a valid key — cutting there is the only correct
   * reading, not a guess.
   */
  it("cuts a swallowed comment block off an API key", () => {
    const k = key();
    process.env[k] = "sk-ant-api03-abc123\n\n# ---- Better Auth ----";
    expect(readSecret(k)).toBe("sk-ant-api03-abc123");
  });

  it("cuts at a carriage return too", () => {
    const k = key();
    process.env[k] = "secret\r\nBETTER_AUTH_URL=http://localhost:3001";
    expect(readSecret(k)).toBe("secret");
  });

  it("still trims what readEnv would trim", () => {
    const k = key();
    process.env[k] = "  secret%0A  ";
    expect(readSecret(k)).toBe("secret");
  });

  it("warns, naming the variable, when it had to cut", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    process.env[k] = "sk-ant-abc\n# ---- Better Auth ----";
    readSecret(k);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain(k);
  });

  it("does not warn for a clean value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const k = key();
    process.env[k] = "sk-ant-abc";
    readSecret(k);
    expect(warn).not.toHaveBeenCalled();
  });

  it("treats an unset or empty value as absent", () => {
    expect(readSecret(key())).toBeUndefined();
    const k = key();
    process.env[k] = "\n\n";
    expect(readSecret(k)).toBeUndefined();
  });
});

describe("the sign-in loop this was written for", () => {
  /**
   * MICROSOFT_TENANT_ID carried a trailing newline in Vercel, so Better Auth
   * built `.../{tenant}%0A/oauth2/v2.0/token` and Microsoft refused the URL
   * before Entra ever saw the request — surfacing only as a redirect loop.
   */
  it("leaves a tenant safe to interpolate into Microsoft's endpoint URL", () => {
    const tenant = sanitizeEnvValue("2dbb05c9-b19f-4164-bc87-9a3f87e7d02e%0A");
    expect(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`).toBe(
      "https://login.microsoftonline.com/2dbb05c9-b19f-4164-bc87-9a3f87e7d02e/oauth2/v2.0/token",
    );
  });
});
