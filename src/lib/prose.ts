/**
 * The small amount of markdown the engine actually writes, parsed into data.
 *
 * The chat rendered answers as plain `whitespace-pre-wrap` text, so the engine's
 * `**Emirates Group**` reached the operator with the asterisks showing. This
 * parses bold, italic, inline code and lists — and nothing else.
 *
 * Deliberately a PARSER, not an HTML producer. It emits only text plus a mark,
 * so `prose.tsx` can build React elements and let React escape every text node.
 * This text comes from a model that has just read the open web; it must never
 * reach `dangerouslySetInnerHTML`.
 */

export type Inline = {
  type: "text" | "bold" | "italic" | "code";
  text: string;
};

export type Block =
  | { type: "p"; inlines: Inline[] }
  | { type: "ul"; items: Inline[][] }
  | { type: "ol"; items: Inline[][] };

/** `- item`, `* item`, `• item` — the engine uses all three. */
const BULLET = /^\s*[-*•]\s+(.*)$/;
/** `1. item` */
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

/**
 * Bold before italic, so `**x**` is not mistaken for an italic `*` pair. Both
 * require a non-space next to the marker, which is what stops `margin * volume`
 * and a trailing `file_name*` from being read as formatting.
 */
const INLINE = /(\*\*(?=\S)(.+?)(?<=\S)\*\*)|(\*(?=\S)([^*]+?)(?<=\S)\*)|(`([^`]+)`)/;

function parseInlines(line: string): Inline[] {
  const out: Inline[] = [];
  let rest = line;

  while (rest.length > 0) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      out.push({ type: "text", text: rest });
      break;
    }

    if (match.index > 0) out.push({ type: "text", text: rest.slice(0, match.index) });

    if (match[2] !== undefined) out.push({ type: "bold", text: match[2] });
    else if (match[4] !== undefined) out.push({ type: "italic", text: match[4] });
    else if (match[6] !== undefined) out.push({ type: "code", text: match[6] });

    rest = rest.slice(match.index + match[0].length);
  }

  // Merge adjacent plain runs so the output stays small and stable.
  return out.reduce<Inline[]>((acc, piece) => {
    const last = acc[acc.length - 1];
    if (last && last.type === "text" && piece.type === "text") last.text += piece.text;
    else if (piece.text.length > 0) acc.push(piece);
    return acc;
  }, []);
}

/** Splits an answer into paragraphs and lists. */
export function parseProse(text: string): Block[] {
  if (!text || !text.trim()) return [];

  const blocks: Block[] = [];
  // A blank line separates paragraphs; single newlines stay inside one.
  for (const chunk of text.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length === 0) continue;

    let buffer: string[] = [];
    const flushParagraph = () => {
      if (buffer.length === 0) return;
      blocks.push({ type: "p", inlines: parseInlines(buffer.join("\n")) });
      buffer = [];
    };

    let listType: "ul" | "ol" | null = null;
    let items: Inline[][] = [];
    const flushList = () => {
      if (listType && items.length > 0) blocks.push({ type: listType, items });
      listType = null;
      items = [];
    };

    for (const line of lines) {
      const bullet = BULLET.exec(line);
      const numbered = NUMBERED.exec(line);

      if (bullet || numbered) {
        const kind = bullet ? "ul" : "ol";
        if (listType && listType !== kind) flushList();
        flushParagraph();
        listType = kind;
        items.push(parseInlines((bullet ? bullet[1] : numbered![1]).trim()));
      } else {
        flushList();
        buffer.push(line);
      }
    }

    flushList();
    flushParagraph();
  }

  return blocks;
}
