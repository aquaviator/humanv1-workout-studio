import { describe, expect, it } from "vitest";
import { blocksPublication, dateFromUnknown, dedupeDiagnostics, formatUserDate, proposePlanReferenceResolution, publicationBlockReason, referenceDiagnostic, timestampDiagnostic } from "../presentation";
import { validatePlan } from "../validation/planValidation";

describe("truthful reconstructed-data presentation", () => {
  const valid = new Date("2026-09-01T12:00:00.000Z");
  it("formats a Date", () => expect(formatUserDate(valid)).toBe(valid.toLocaleDateString()));
  it("formats a Firestore Timestamp", () => expect(formatUserDate({ toDate: () => valid })).toBe(valid.toLocaleDateString()));
  it("formats an ISO string", () => expect(formatUserDate(valid.toISOString())).toBe(valid.toLocaleDateString()));
  it("formats canonical epoch milliseconds", () => expect(formatUserDate(valid.getTime())).toBe(valid.toLocaleDateString()));
  it.each([undefined, null, "", "nonsense", Number.NaN, 1234, Number.POSITIVE_INFINITY])("uses the unavailable state for %s", value => expect(formatUserDate(value)).toBe("Timestamp unavailable"));
  it("never fabricates the current date", () => expect(dateFromUnknown("not-a-date")).toBeNull());
  it("supports legacy timestamp fields", () => expect(formatUserDate({ _seconds: valid.getTime() / 1000, _nanoseconds: 0 })).toBe(valid.toLocaleDateString()));
  it("labels absent and invalid timestamp evidence safely", () => {
    expect(timestampDiagnostic(null)[0].reason).toBe("Not recorded");
    expect(timestampDiagnostic("bad")[0].reason).toBe("Invalid legacy timestamp");
  });
  it("distinguishes absent from archived parents using unfiltered evidence", () => {
    expect(referenceDiagnostic("workout", "workout_1", undefined)?.category).toBe("MISSING_PARENT");
    expect(referenceDiagnostic("workout", "workout_1", { deletedAt: 1 })?.category).toBe("ARCHIVED_PARENT");
    expect(referenceDiagnostic("workout", "workout_1", { deletedAt: null })).toBeNull();
  });
  it("does not block publication for a missing timestamp alone", () => expect(blocksPublication(timestampDiagnostic(null))).toBe(false));
  it("blocks publication for a structural dependency", () => expect(blocksPublication([referenceDiagnostic("workout", "missing", null)!])).toBe(true));
  it("reuses plan validation for structural publication safety", () => {
    const diagnostic = referenceDiagnostic("workout", "missing", null)!;
    const plan = { schemaVersion: "humanv1.plan/1", planId: "p", title: "Plan", description: "", weeks: [{ weekId: "w", weekNumber: 1, label: "", placements: [] }], reconstructionDiagnostics: [diagnostic] };
    expect(validatePlan(plan).map(error => error.message)).toContain("Cannot publish: one workout reference is unavailable");
  });
  it("uses distinct, counted publication explanations", () => {
    expect(publicationBlockReason([referenceDiagnostic("workout", "archived", { deletedAt: 1 })!])).toBe("Cannot publish: one scheduled workout is archived");
    expect(publicationBlockReason([referenceDiagnostic("workout", "a", null)!, referenceDiagnostic("workout", "b", null)!])).toBe("Cannot publish: 2 workout references are unavailable");
    expect(publicationBlockReason(timestampDiagnostic(null))).toBeNull();
  });
  it("collapses repeated diagnostics for the same stable reference", () => {
    const diagnostic = referenceDiagnostic("workout", "workout_1", null)!;
    expect(dedupeDiagnostics([diagnostic, diagnostic])).toHaveLength(1);
  });
  it("creates deterministic non-mutating replacement and removal proposals", () => {
    const plan = { weeks: [{ placements: [{ placementId: "placement_b", workoutId: "template_legs" }, { placementId: "placement_a", workoutId: "template_legs" }, { placementId: "other", workoutId: "other" }] }] };
    const before = structuredClone(plan);
    expect(proposePlanReferenceResolution(plan, "template_legs", { type: "REMOVE" })).toEqual({ mode: "DRY_RUN", referenceId: "template_legs", action: { type: "REMOVE" }, affectedPlacementIds: ["placement_a", "placement_b"] });
    expect(proposePlanReferenceResolution(plan, "template_legs", { type: "REPLACE", workoutId: "replacement", workoutVersionId: "replacement_r1_aaaaaaaaaaaa" }).affectedPlacementIds).toEqual(["placement_a", "placement_b"]);
    expect(plan).toEqual(before);
  });
});
