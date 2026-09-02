import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "growth-studio" });

export const SWEEP_EVENT = "growth-studio/sweeps.requested" as const;
