import { Fragment } from "react";

import { parseProse, type Inline } from "@/lib/prose";

/**
 * Renders an engine answer.
 *
 * Builds React elements from the parse in `@/lib/prose` — never
 * `dangerouslySetInnerHTML`. That is the point: this text comes from a model
 * that has just read the open web, and because every piece arrives as a text
 * node React escapes it, so markup in an answer can only ever be displayed, not
 * executed.
 */
export function Prose({ text }: { text: string }) {
  const blocks = parseProse(text);
  if (blocks.length === 0) return null;

  return (
    <div className="prose-chat text-body">
      {blocks.map((block, i) => {
        if (block.type === "p") {
          return (
            <p key={i} className={i > 0 ? "mt-3" : undefined}>
              <Inlines parts={block.inlines} />
            </p>
          );
        }

        const List = block.type === "ul" ? "ul" : "ol";
        return (
          <List
            key={i}
            className={`${i > 0 ? "mt-3 " : ""}${
              block.type === "ul" ? "list-disc" : "list-decimal"
            } space-y-0.5 pl-5`}
          >
            {block.items.map((item, j) => (
              <li key={j}>
                <Inlines parts={item} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((part, i) => {
        switch (part.type) {
          case "bold":
            return (
              <strong key={i} className="font-medium text-body">
                {part.text}
              </strong>
            );
          case "italic":
            return <em key={i}>{part.text}</em>;
          case "code":
            return (
              <code key={i} className="rounded bg-panel px-1 py-0.5 text-[0.9em]">
                {part.text}
              </code>
            );
          default:
            // Single newlines stay inside a paragraph, so honour them.
            return (
              <Fragment key={i}>
                {part.text.split("\n").map((line, j, all) => (
                  <Fragment key={j}>
                    {line}
                    {j < all.length - 1 && <br />}
                  </Fragment>
                ))}
              </Fragment>
            );
        }
      })}
    </>
  );
}
