import { describe, expect, it } from "vitest";

import { classifyZohoError, describeZohoError } from "./errors";

const err = (status: number, code: string | null = null, message = "x") => ({ status, code, message });

describe("classifyZohoError", () => {
  /**
   * The one that already bit us. Observed live against Zoho: asking for an
   * endpoint outside the granted scope returns 401 — NOT 403 — with
   * OAUTH_SCOPE_MISMATCH. Branching on the status alone called that a bad
   * token, which points the operator at the data centre instead of the grant.
   */
  it("reads OAUTH_SCOPE_MISMATCH as a scope problem even though it arrives as a 401", () => {
    expect(classifyZohoError(err(401, "OAUTH_SCOPE_MISMATCH"))).toBe("scope");
    expect(describeZohoError(err(401, "OAUTH_SCOPE_MISMATCH"))).toContain("re-consent");
    // And explicitly NOT the data-centre reading.
    expect(describeZohoError(err(401, "OAUTH_SCOPE_MISMATCH"))).not.toContain("data centre");
  });

  it("still reads a plain 401 as an auth or data-centre problem", () => {
    expect(classifyZohoError(err(401))).toBe("auth");
    expect(classifyZohoError(err(401, "INVALID_TOKEN"))).toBe("auth");
    expect(describeZohoError(err(401))).toContain("data centre");
  });

  it("keeps 403 as a scope problem, since some endpoints do use it", () => {
    expect(classifyZohoError(err(403))).toBe("scope");
  });

  it("separates a data refusal, which retrying will never fix", () => {
    for (const code of ["INVALID_DATA", "MANDATORY_NOT_FOUND", "DUPLICATE_DATA"]) {
      expect(classifyZohoError(err(400, code)), code).toBe("data");
    }
    // The first-run failure this whole exercise is about: an unknown picklist
    // value. The message must name the code, because Zoho's own text does not
    // say which field was wrong.
    expect(describeZohoError(err(400, "INVALID_DATA"))).toContain("INVALID_DATA");
  });

  it("separates throttling from failure, so it cannot disable a healthy connection", () => {
    expect(classifyZohoError(err(429))).toBe("throttled");
  });

  it("treats a 5xx and a network error as retryable", () => {
    expect(classifyZohoError(err(500))).toBe("transient");
    expect(classifyZohoError(err(503))).toBe("transient");
    // status 0 is how the fetch wrapper reports a network failure.
    expect(classifyZohoError(err(0, "network"))).toBe("transient");
  });

  it("never claims to know what it does not", () => {
    expect(classifyZohoError(err(418, "IM_A_TEAPOT"))).toBe("unknown");
    expect(describeZohoError(err(418, "IM_A_TEAPOT"))).toContain("418");
  });

  it("says nothing that could carry a record's contents (PRD §8)", () => {
    // Zoho echoes the offending record in an INVALID_DATA body; only the code
    // and status may ever reach a message or a log.
    const message = describeZohoError(err(400, "INVALID_DATA", "rashid@emirates.com refused"));
    expect(message).not.toContain("@");
  });
});
