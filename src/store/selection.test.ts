import { beforeEach, describe, expect, it } from "vitest";

import type { PipelineCardRow } from "@/db/queries";

import { useSelection, useWorkspace } from "./selection";

const card = { id: "card-1", account: "Emaar", stage: "Plan reach-out" } as PipelineCardRow;

beforeEach(() => {
  useSelection.setState({ card: null });
  useWorkspace.setState({ draft: "", selectedCardId: null, inspectorOpen: true, cursor: 0 });
});

describe("selection", () => {
  it("mirrors the selected card's id into the persisted store", () => {
    useSelection.getState().select(card);
    expect(useSelection.getState().card?.id).toBe("card-1");
    // The id is what survives a refresh. The row itself deliberately does not:
    // it is server-owned, and a restored copy would show stale numbers.
    expect(useWorkspace.getState().selectedCardId).toBe("card-1");
  });

  it("clears both when the selection is cleared", () => {
    useSelection.getState().select(card);
    useSelection.getState().select(null);
    expect(useSelection.getState().card).toBeNull();
    expect(useWorkspace.getState().selectedCardId).toBeNull();
  });
});

describe("workspace", () => {
  it("keeps the composer draft", () => {
    useWorkspace.getState().setDraft("what's moving in UAE");
    expect(useWorkspace.getState().draft).toBe("what's moving in UAE");
  });

  it("toggles the inspector", () => {
    expect(useWorkspace.getState().inspectorOpen).toBe(true);
    useWorkspace.getState().toggleInspector();
    expect(useWorkspace.getState().inspectorOpen).toBe(false);
  });

  it("remembers the pipeline cursor row", () => {
    useWorkspace.getState().setCursor(4);
    expect(useWorkspace.getState().cursor).toBe(4);
  });

  /**
   * When the browser offers no storage — a private window, or site data
   * blocked — zustand's persist middleware attaches no API to the store at all.
   * This environment has no localStorage, so it reproduces that exactly.
   *
   * The store must keep working regardless, and `providers.tsx` must not assume
   * `.persist` exists: calling `.rehydrate()` on undefined during mount would
   * take the whole app down to save a draft.
   */
  it("still works when the browser gives us no storage", () => {
    expect(useWorkspace.persist).toBeUndefined();
    useWorkspace.getState().setDraft("still typed");
    expect(useWorkspace.getState().draft).toBe("still typed");
  });
});
