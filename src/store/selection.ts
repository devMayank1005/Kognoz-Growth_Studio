"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { PipelineCardRow } from "@/db/queries";

/**
 * Which card the inspector is showing.
 *
 * Small, cross-component UI state — exactly what the store is for. Keeping it
 * here avoids threading a callback from the Pipeline table up through the
 * studio layout and back down into the inspector.
 *
 * The row itself is deliberately NOT persisted: it is server-owned data, and a
 * stale copy restored from a previous session would show numbers that are no
 * longer true. Only its id is remembered (below), and the row is recovered from
 * the freshly loaded list.
 */
interface SelectionState {
  card: PipelineCardRow | null;
  select: (card: PipelineCardRow | null) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  card: null,
  select: (card) => {
    set({ card });
    // Remember the id so a refresh can restore the same row.
    useWorkspace.getState().setSelectedCardId(card?.id ?? null);
  },
}));

/**
 * The bits of the operator's place in the app that should survive a refresh.
 *
 * Ids and view state only — never server-owned rows. An accidental reload (or a
 * closed laptop) should not cost someone the half-typed question they were
 * working on, but it must also never resurrect stale pipeline data.
 *
 * `skipHydration` matters: reading localStorage during the first client render
 * would disagree with the server's HTML and trip a hydration mismatch. The
 * store rehydrates just after mount instead — see `WorkspaceHydration` in
 * components/providers.tsx.
 */
interface WorkspaceState {
  /** Typed-but-unsent chat input. */
  draft: string;
  setDraft: (draft: string) => void;

  /** Restored into `useSelection` once the card list has loaded. */
  selectedCardId: string | null;
  setSelectedCardId: (id: string | null) => void;

  /** Inspector pane, on viewports where it can be collapsed. */
  inspectorOpen: boolean;
  toggleInspector: () => void;

  /** Keyboard cursor row in the pipeline table. */
  cursor: number;
  setCursor: (cursor: number) => void;
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set) => ({
      draft: "",
      setDraft: (draft) => set({ draft }),

      selectedCardId: null,
      setSelectedCardId: (selectedCardId) => set({ selectedCardId }),

      inspectorOpen: true,
      toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

      cursor: 0,
      setCursor: (cursor) => set({ cursor }),
    }),
    {
      name: "gs-workspace",
      skipHydration: true,
      version: 1,
    },
  ),
);
