import { describe, expect, it } from "vitest";
import { triathlonResearchDataset, triathlonResearchPlans } from "../../fixtures/triathlonResearchFixtures";
import { deriveAthletePlanOverview, evidenceDirectnessLabel, evidenceVerificationLabel, formatTrainingMinutes, friendlyPhaseName, presentationSafePhasePurpose, researchSessionPresentation } from "../researchPlanPresentation";

describe("research plan presentation", () => {
  it("resolves authoritative session names, duration and discipline", () => {
    expect(researchSessionPresentation("s_easy_30", triathlonResearchDataset.sessions)).toMatchObject({ available: true, title: "Easy Aerobic Swim", duration: "30 min", discipline: "SWIM" });
    expect(researchSessionPresentation("race_half_im", triathlonResearchDataset.sessions).duration).toBe("Variable duration");
  });
  it("fails truthfully when a stable session ID is unresolved", () => expect(researchSessionPresentation("missing", [])).toEqual({ available: false, title: "Session details unavailable", duration: "Duration unavailable", discipline: undefined }));
  it("maps internal evidence enums to athlete language", () => {
    expect(evidenceDirectnessLabel("DIRECT")).toBe("Directly supported");
    expect(evidenceDirectnessLabel("EXTRAPOLATED")).toBe("Applied from related evidence");
    expect(evidenceVerificationLabel("VERIFIED")).toBe("Source verified");
    expect(evidenceVerificationLabel("REQUIRES_VERIFICATION")).toBe("Further review required");
  });
  it("derives athlete overview values and friendly durations without changing source data", () => {
    const source = structuredClone(triathlonResearchPlans[0]);
    const overview = deriveAthletePlanOverview(source, triathlonResearchDataset.sessions);
    expect(overview).toMatchObject({ eventDistance: "Half Ironman", experienceLevel: "First-time finisher", weeklyRange: "2 hr 5 min–8 hr 15 min", peakWeek: expect.stringMatching(/^Week \d+ · 8 hr 15 min$/), recoveryWeeks: [4, 8] });
    expect(formatTrainingMinutes(1890)).toBe("31 hr 30 min");
    expect(friendlyPhaseName("Specific Peak")).toBe("Race-Specific Peak");
  });
  it("uses neutral UI copy while preserving an editorial diagnostic", () => expect(presentationSafePhasePurpose("Reduce volume while maintaining intensity to peak enzymatic activity.")).toEqual({ text: "Reduce training volume while retaining selected intensity before the event.", editorialDiagnostic: expect.stringContaining("source objective") }));
});
