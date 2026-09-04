import { describe, expect, it } from "vitest";
import { TOWER_TARGETS } from "./revenue";
import {
  PRACTICES,
  TOWERS,
  TOWER_KEYS,
  practiceByName,
  practiceForTarget,
  practicesForSignal,
  towerOfPractice,
} from "./practices";

describe("practices", () => {
  it("carries the 10 practices across the two brands", () => {
    expect(PRACTICES).toHaveLength(10);
    expect(PRACTICES.filter((p) => p.brand === "Konverz")).toHaveLength(4);
    expect(PRACTICES.filter((p) => p.brand === "Kognoz")).toHaveLength(6);
  });

  it("gives every practice exactly one tower", () => {
    for (const p of PRACTICES) {
      const owning = TOWER_KEYS.filter((t) => TOWERS[t].practices.includes(p.id));
      expect(owning).toHaveLength(1);
    }
  });

  it("routes each practice to the tower that owns it", () => {
    expect(towerOfPractice("hire")).toBe("T3");
    expect(towerOfPractice("hrtx")).toBe("T2");
    expect(towerOfPractice("family")).toBe("T1");
    expect(towerOfPractice("skills")).toBe("T4");
  });

  it("keeps tower targets in step with the revenue split", () => {
    for (const t of TOWER_KEYS) expect(TOWERS[t].target).toBe(TOWER_TARGETS[t]);
  });
});

describe("practiceByName", () => {
  it("resolves the bare solution name the engine emits", () => {
    expect(practiceByName("Hire")?.id).toBe("hire");
    expect(practiceByName("Learn + Coach")?.id).toBe("learncoach");
    expect(practiceByName("Talent")?.id).toBe("talent");
  });

  it("resolves the full name including the product parenthetical", () => {
    expect(practiceByName("Hire (JobFit AI)")?.id).toBe("hire");
  });

  it("returns undefined for a solution it does not recognise", () => {
    expect(practiceByName("Quantum Astrology")).toBeUndefined();
  });
});

describe("practicesForSignal", () => {
  it("maps a hiring signal to the Hire practice", () => {
    expect(practicesForSignal("H1").map((p) => p.id)).toContain("hire");
  });

  it("maps an HCM go-live to the practices that can play it", () => {
    const ids = practicesForSignal("L6").map((p) => p.id);
    expect(ids).toContain("hrtx");
    expect(ids).toContain("skills");
  });

  it("returns an empty list for a signal no practice claims", () => {
    expect(practicesForSignal("ZZ9")).toEqual([]);
  });
});

describe("practiceForTarget — AMS must not be routed by signal order", () => {
  /**
   * L6 is declared by `nurture` (T4) before `hrtx` (T2), so
   * practicesForSignal("L6")[0] returns Nurture. The scorer correctly pins an
   * aged L6 to T2, but both row builders took the signal's first practice, so
   * an AMS door was added to T4 with the T4 partner and the T4 revenue target.
   */
  it("routes an AMS target to the T2 HR Transformation practice", () => {
    const practice = practiceForTarget({ ams: true, signal: "L6" });
    expect(practice?.id).toBe("hrtx");
    expect(towerOfPractice(practice!.id)).toBe("T2");
  });

  it("still uses the signal's practice when the target is not AMS", () => {
    expect(practiceForTarget({ ams: false, signal: "L6" })?.id).toBe(
      practicesForSignal("L6")[0]?.id,
    );
  });

  it("routes AMS to T2 whatever the signal says", () => {
    for (const signal of ["L6", "L13", "L9", "H5"]) {
      expect(towerOfPractice(practiceForTarget({ ams: true, signal })!.id)).toBe("T2");
    }
  });

  it("falls back to the signal practice when AMS is absent", () => {
    expect(practiceForTarget({ signal: "L1" })?.id).toBe(practicesForSignal("L1")[0]?.id);
  });
});
