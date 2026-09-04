"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { newConversation, remove, rename, undoRemove } from "@/app/actions/conversations";
import type { ConversationSummary } from "@/db/conversations";
import { titleFromText } from "@/lib/titles";

/**
 * The conversation switcher (PRD §3, §9.6).
 *
 * A compact menu at the top of the chat pane rather than a third column: the
 * studio is already rail + content + inspector, and a sidebar would fight the
 * layout at every width.
 *
 * The pinned brief sorts first and cannot be renamed or deleted — it is
 * rewritten every morning, so a rename would not survive the night and a delete
 * would simply reappear.
 */
export function ConversationSwitcher({
  conversations,
  currentId,
}: {
  conversations: ConversationSummary[];
  currentId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  /**
   * Renames and deletes are shown immediately, before the server confirms.
   *
   * The server action itself is quick, but the re-render it triggers has to
   * reach Postgres in Ohio and come back — measured at ~5s from here. Without
   * this the operator pressed Enter on a new title and watched nothing happen
   * for five seconds, which reads exactly like a broken button. Reverted if the
   * write actually fails; harmless once the server catches up, because it then
   * agrees.
   */
  const [pendingTitles, setPendingTitles] = useState<Record<string, string>>({});
  const [pendingDeletes, setPendingDeletes] = useState<string[]>([]);

  const visible = conversations
    .filter((c) => !pendingDeletes.includes(c.id))
    .map((c) => (pendingTitles[c.id] ? { ...c, title: pendingTitles[c.id] } : c));

  const current = visible.find((c) => c.id === currentId) ?? null;

  // Click-away and Escape close the menu. Without this it stayed open behind
  // every subsequent click, over the answer the operator was trying to read.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    router.push(`/chat?c=${id}`);
  };

  async function startNew() {
    setBusy(true);
    try {
      const r = await newConversation();
      setOpen(false);
      router.push(`/chat?c=${r.id}`);
    } catch {
      toast.error("Could not start a conversation", {
        description: "The server did not answer. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function commitRename(id: string, title: string) {
    setEditing(null);
    const clean = title.trim();
    if (!clean) return;

    const previous = visible.find((c) => c.id === id)?.title;
    // Match the server's own truncation, so the name does not visibly change
    // again a moment later.
    setPendingTitles((t) => ({ ...t, [id]: titleFromText(clean) }));

    const revert = () =>
      setPendingTitles((t) => {
        const next = { ...t };
        if (previous === undefined) delete next[id];
        else next[id] = previous;
        return next;
      });

    try {
      const r = await rename(id, clean);
      if (!r.ok) {
        revert();
        return toast.error(r.message);
      }
      router.refresh();
    } catch {
      revert();
      toast.error("Could not rename that conversation");
    }
  }

  async function askDelete(id: string, title: string) {
    setPendingDeletes((d) => [...d, id]);
    try {
      const r = await remove(id);
      if (!r.ok) {
        setPendingDeletes((d) => d.filter((x) => x !== id));
        return toast.error(r.message);
      }

      // §9.6 — destructive, so it gets six seconds of Undo rather than a
      // confirm dialog standing between the operator and a tidy list.
      const rest = visible.filter((c) => c.id !== id);
      if (id === currentId) router.push(rest[0] ? `/chat?c=${rest[0].id}` : "/chat");
      else router.refresh();

      toast.success(`“${title}” deleted`, {
        duration: 6000,
        action: {
          label: "Undo",
          onClick: () => {
            void undoRemove(r.removed)
              .then((back) => {
                toast.success(`“${title}” restored`);
                router.push(`/chat?c=${back.id}`);
              })
              .catch(() => toast.error("Could not restore that conversation"));
          },
        },
      });
    } catch {
      setPendingDeletes((d) => d.filter((x) => x !== id));
      toast.error("Could not delete that conversation");
    }
  }

  return (
    <div ref={boxRef} className="relative border-b border-line px-6 py-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel"
        >
          <span className="truncate">{current?.title ?? "New conversation"}</span>
          <span aria-hidden className="text-[10px] text-faint">▾</span>
        </button>

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => void startNew()}
          disabled={busy}
          className="rounded border border-line px-2 py-1 text-[12px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
        >
          ＋ New
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            role="menu"
            className="absolute left-6 top-full z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded border border-line bg-canvas py-1 shadow-lg"
          >
            {visible.length === 0 && (
              <p className="px-3 py-2 text-[12px] text-faint">Ask something to start one.</p>
            )}

            {visible.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 px-2 py-1 ${
                  c.id === currentId ? "bg-panel" : "hover:bg-panel"
                }`}
              >
                {editing === c.id ? (
                  <input
                    autoFocus
                    defaultValue={c.title}
                    aria-label="Conversation title"
                    onBlur={(e) => void commitRename(c.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(c.id, e.currentTarget.value);
                      if (e.key === "Escape") setEditing(null);
                    }}
                    className="w-full rounded border border-line bg-canvas px-1.5 py-0.5 text-[12px] text-body"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => go(c.id)}
                      className="min-w-0 flex-1 truncate px-1 py-0.5 text-left text-[12px] text-body"
                    >
                      {c.kind === "brief" && <span className="mr-1 text-faint">◆</span>}
                      {c.title}
                    </button>

                    {/* The brief is rewritten nightly; renaming or deleting it
                        would not stick, so it simply does not offer them. */}
                    {c.kind === "chat" && (
                      <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          onClick={() => setEditing(c.id)}
                          aria-label={`Rename ${c.title}`}
                          className="px-1 text-[11px] text-faint hover:text-body"
                        >
                          rename
                        </button>
                        <button
                          type="button"
                          onClick={() => void askDelete(c.id, c.title)}
                          aria-label={`Delete ${c.title}`}
                          className="px-1 text-[11px] text-faint hover:text-danger"
                        >
                          delete
                        </button>
                      </span>
                    )}
                  </>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
