import { describe, expect, it } from "vitest";

import { STAGES, type Stage } from "../routing";
import { isZohoDealStage, stageFromZoho, ZOHO_DEAL_STAGES, zohoStageFor } from "./stage";

describe("zohoStageFor", () => {
  it("maps every local stage, with no gaps", () => {
    for (const stage of STAGES) {
      expect(isZohoDealStage(zohoStageFor(stage)), stage).toBe(true);
    }
  });

  it("matches the reference prototype's map exactly", () => {
    expect(STAGES.map(zohoStageFor)).toEqual([
      "Qualification", "Qualification", "Qualification", "Needs Analysis",
      "Value Proposition", "Proposal/Price Quote", "Closed Won", "Closed Lost",
    ]);
  });
});

describe("stageFromZoho", () => {
  /**
   * The trap the reverse map exists to avoid. Three local stages all push as
   * "Qualification", so a naive reverse lookup would drag every Plan reach-out
   * card forward to Reached out on the first reconcile — for every card, every
   * hour, forever.
   */
  it("returns null when the remote is exactly what we would have pushed", () => {
    for (const stage of STAGES) {
      expect(stageFromZoho(zohoStageFor(stage), stage), stage).toBeNull();
    }
  });

  it("never sends a card back to Prospect or Plan reach-out", () => {
    // A record that exists as a Deal is past Prospect by construction, and
    // demoting it would strand the zohoDealId that proves it converted.
    for (const remote of ZOHO_DEAL_STAGES) {
      for (const local of STAGES) {
        const next = stageFromZoho(remote, local);
        expect(next === "Prospect" || next === "Plan reach-out", `${remote}/${local}`).toBe(false);
      }
    }
  });

  it("applies a genuine remote advance", () => {
    expect(stageFromZoho("Closed Won", "Proposal")).toBe("Won");
    expect(stageFromZoho("Proposal/Price Quote", "Meeting set")).toBe("Proposal");
    expect(stageFromZoho("Needs Analysis", "Plan reach-out")).toBe("In conversation");
  });

  it("ignores a picklist value the client customised", () => {
    // Guessing at an unknown stage would move a card on no evidence.
    expect(stageFromZoho("Discovery Call", "Proposal")).toBeNull();
    expect(stageFromZoho("", "Proposal")).toBeNull();
  });

  it("round-trips every remote stage back to something that pushes as itself", () => {
    for (const remote of ZOHO_DEAL_STAGES) {
      // Use a local stage that differs, so the forward-equal guard does not fire.
      const local: Stage = remote === "Closed Won" ? "Prospect" : "Won";
      const next = stageFromZoho(remote, local);
      if (next) expect(zohoStageFor(next), remote).toBe(remote);
    }
  });
});
