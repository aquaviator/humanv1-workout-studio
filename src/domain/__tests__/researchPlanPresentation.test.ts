import { describe, expect, it } from "vitest";
import { triathlonResearchDataset } from "../../fixtures/triathlonResearchFixtures";
import { evidenceDirectnessLabel, evidenceVerificationLabel, presentationSafePhasePurpose, researchSessionPresentation } from "../researchPlanPresentation";

describe("research plan presentation", () => {
  it("resolves authoritative session names, duration and discipline", () => {
    expect(researchSessionPresentation("s_easy_30", triathlonResearchDataset.sessions)).toMatchObject({ available: true, title: "Easy Aerobic Swim", duration: "30 min", discipline: "SWIM" });
    expect(researchSessionPresentation("race_half_im", triathlonResearchDataset.sessions).duration).toBe("Variable duration");
  });
  it("fails truthfully when a stable session ID is unresolved", () => expect(researchSessionPresentation("missing", [])).toEqual({ available: false, title: "Session details unavailable", duration: "Duration unavailable", discipline: undefined }));
  it("maps internal evidence enums to athlete language", () => {
    expect(evidenceDirectnessLabel("DIRECT")).toBe("Direct evidence");
    expect(evidenceDirectnessLabel("EXTRAPOLATED")).toBe("Applied from related evidence");
    expect(evidenceVerificationLabel("VERIFIED")).toBe("Verified source");
    expect(evidenceVerificationLabel("REQUIRES_VERIFICATION")).toBe("Further verification required");
  });
  it("uses neutral UI copy while preserving an editorial diagnostic", () => expect(presentationSafePhasePurpose("Reduce volume while maintaining intensity to peak enzymatic activity.")).toEqual({ text: "Reduce training volume while retaining selected intensity before the event.", editorialDiagnostic: expect.stringContaining("source objective") }));
});
