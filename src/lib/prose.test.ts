import { describe, expect, it } from "vitest";

import { parseProse, type Block } from "./prose";

/** Flattens a parse back to plain text, for asserting nothing was lost. */
const textOf = (blocks: Block[]): string =>
  blocks
    .map((b) =>
      b.type === "p"
        ? b.inlines.map((i) => i.text).join("")
        : b.items.map((it) => it.map((i) => i.text).join("")).join("\n"),
    )
    .join("\n");

describe("parseProse", () => {
  /**
   * The real stored answer. The engine writes light markdown and the renderer
   * was plain `whitespace-pre-wrap` text, so this reached the operator with
   * literal asterisks around the company name.
   */
  it("marks **bold** and drops the asterisks", () => {
    const blocks = parseProse("Two things need you:\n\n**Emirates Group** is the first.");
    expect(textOf(blocks)).not.toContain("**");

    const bold = blocks.flatMap((b) => (b.type === "p" ? b.inlines : [])).filter((i) => i.type === "bold");
    expect(bold.map((i) => i.text)).toEqual(["Emirates Group"]);
  });

  it("marks italic and inline code", () => {
    const inlines = parseProse("that is *probably* the `signal_code` column").flatMap((b) =>
      b.type === "p" ? b.inlines : [],
    );
    expect(inlines.find((i) => i.type === "italic")?.text).toBe("probably");
    expect(inlines.find((i) => i.type === "code")?.text).toBe("signal_code");
  });

  it("splits paragraphs on a blank line", () => {
    expect(parseProse("First.\n\nSecond.").filter((b) => b.type === "p")).toHaveLength(2);
  });

  it("keeps a single newline inside one paragraph", () => {
    const blocks = parseProse("Due today:\nEmaar\nAldar");
    expect(blocks).toHaveLength(1);
    expect(textOf(blocks)).toContain("Emaar");
    expect(textOf(blocks)).toContain("Aldar");
  });

  it("parses a bullet list, including the • the engine actually emits", () => {
    for (const marker of ["-", "*", "•"]) {
      const blocks = parseProse(`Open first:\n${marker} Emaar\n${marker} Aldar\n${marker} ADNOC`);
      const list = blocks.find((b) => b.type === "ul");
      expect(list, `marker ${marker}`).toBeDefined();
      expect(list && list.type === "ul" ? list.items : []).toHaveLength(3);
    }
  });

  it("parses a numbered list", () => {
    const list = parseProse("Order:\n1. Emaar\n2. Aldar").find((b) => b.type === "ol");
    expect(list && list.type === "ol" ? list.items : []).toHaveLength(2);
  });

  it("keeps formatting inside list items", () => {
    const list = parseProse("- **Emaar** is ready").find((b) => b.type === "ul");
    const first = list && list.type === "ul" ? list.items[0] : [];
    expect(first.find((i) => i.type === "bold")?.text).toBe("Emaar");
  });

  /**
   * The text comes from a model that has just read the open web. The parser only
   * ever produces text and a mark — it never produces markup — so the renderer
   * has nothing unsafe to hand React.
   */
  it("treats HTML in the model's output as ordinary text", () => {
    const blocks = parseProse('<img src=x onerror="alert(1)"> and <b>not bold</b>');
    expect(textOf(blocks)).toContain("<b>not bold</b>");
    for (const b of blocks) {
      const kinds = b.type === "p" ? b.inlines.map((i) => i.type) : b.items.flat().map((i) => i.type);
      expect(kinds.every((k) => ["text", "bold", "italic", "code"].includes(k))).toBe(true);
    }
  });

  it("leaves a plain answer byte-identical", () => {
    const plain = "Nothing due today. Go hunting.";
    expect(textOf(parseProse(plain))).toBe(plain);
  });

  it("does not treat a lone or mid-word asterisk as formatting", () => {
    expect(textOf(parseProse("margin * volume, and file_name*"))).toBe("margin * volume, and file_name*");
  });

  it("keeps the text when a bold marker is never closed", () => {
    expect(textOf(parseProse("**Emirates Group is hiring"))).toContain("Emirates Group is hiring");
  });

  it("handles empty and whitespace-only input", () => {
    expect(parseProse("")).toEqual([]);
    expect(parseProse("   ")).toEqual([]);
  });

  it("never loses a character of a mixed real answer", () => {
    const answer =
      "Morning. Overnight I ran 11 sweeps.\n\n" +
      "**Emirates Group** — 20,000 hires announced.\n" +
      "- Aldar, *proposal* stage\n" +
      "- ADNOC, first touch\n\n" +
      "Ask `what is due today` for the rest.";
    const flat = textOf(parseProse(answer));
    for (const word of ["Emirates Group", "20,000", "Aldar", "proposal", "ADNOC", "what is due today"]) {
      expect(flat, word).toContain(word);
    }
    expect(flat).not.toContain("**");
    expect(flat).not.toContain("`");
  });
});
