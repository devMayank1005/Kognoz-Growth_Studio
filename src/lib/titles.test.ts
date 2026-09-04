import { describe, expect, it } from "vitest";

import { titleFromText } from "./titles";

/**
 * Everything else in the conversations layer touches Postgres and
 * is covered by the integration probe, not here — the vitest environment is
 * `node` with no database.
 */
describe("titleFromText", () => {
  it("uses the question as the title", () => {
    expect(titleFromText("what is due today")).toBe("what is due today");
  });

  it("collapses the newlines and runs of spaces a paste brings with it", () => {
    expect(titleFromText("  Konverz learn\n\n  prospects  ")).toBe("Konverz learn prospects");
  });

  it("truncates a long question with an ellipsis, not mid-list", () => {
    const long = "Konverz learn prospects in large learning and training accounts across the Gulf";
    const title = titleFromText(long);
    expect(title).toHaveLength(58); // 57 + the ellipsis
    expect(title.endsWith("…")).toBe(true);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it("keeps a title that is exactly at the limit intact", () => {
    const exact = "x".repeat(60);
    expect(titleFromText(exact)).toBe(exact);
  });

  it("falls back rather than showing an empty menu row", () => {
    expect(titleFromText("")).toBe("New conversation");
    expect(titleFromText("   \n  ")).toBe("New conversation");
  });
});
