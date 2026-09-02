"use client";

import { create } from "zustand";

import type { PipelineCardRow } from "@/db/queries";

/**
 * Which card the inspector is showing.
 *
 * Small, cross-component UI state — exactly what the store is for. Keeping it
 * here avoids threading a callback from the Pipeline table up through the
 * studio layout and back down into the inspector.
 */
interface SelectionState {
  card: PipelineCardRow | null;
  select: (card: PipelineCardRow | null) => void;
}

export const useSelection = create<SelectionState>((set) => ({
  card: null,
  select: (card) => set({ card }),
}));
