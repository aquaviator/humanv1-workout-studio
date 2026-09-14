import { describe, expect, it } from "vitest";
import { validatePlanPublicationDependencies } from "../../publicationDiagnostics";
import { Plan, Workout } from "../../types";

const workout = (workoutId: string, title: string): Workout => ({
  schemaVersion: "humanv1.workout/1", workoutId, title, discipline: "STRENGTH", catalogueReleaseId: "cross_app", tags: [],
  blocks: [{ blockId: `${workoutId}_block`, type: "EXERCISE", exerciseId: "squat", exerciseNameSnapshot: "Squat", efforts: [{ effortId: `${workoutId}_set`, effortType: "WORKING", prescriptions: [{ prescriptionId: `${workoutId}_reps`, metricKey: "repetitions", targetValue: 5 }] }] }],
});
const plan = (ids: string[]): Plan => ({ schemaVersion: "humanv1.plan/1", planId: "71f743c0-964f-4791-8234-25263fb33ddf", title: "my plan", description: "Synced from Human Strength", weeks: [{ weekId: "week_1", weekNumber: 1, label: "Week 1", placements: ids.map((id, index) => ({ placementId: `placement_${index}`, dayOfWeek: index + 1, workoutId: id, workoutVersionId: `${id}_v1`, preferredMinuteOfDay: null, reminderEnabled: false, notes: "" })) }] });

describe("plan publication dependency diagnostics", () => {
  it.each([["template_d0333e99e198", "Pull Day"], ["template_push", "Push Day"]])("reproduces the production-shaped empty %s dependency", (id, title) => {
    const malformed = { ...workout(id, title), blocks: [] };
    expect(validatePlanPublicationDependencies(plan([id]), [malformed], new Set())).toMatchObject([{
      errorCode: "INVALID_CONTENT", entityType: "workout", entityId: id, displayName: title, fieldPath: "blocks",
      validationRule: "WORKOUT_REQUIRES_EXECUTABLE_BLOCK", sourceMigrationRequired: true, retryEligibility: "NOT_RETRYABLE",
    }]);
  });

  it("reports both malformed production dependencies instead of stopping at the first", () => {
    const pull = { ...workout("template_d0333e99e198", "Pull Day"), blocks: [] };
    const push = { ...workout("template_push", "Push Day"), blocks: [] };
    expect(validatePlanPublicationDependencies(plan([pull.workoutId, push.workoutId]), [pull, push], new Set()).map(item => item.displayName)).toEqual(["Pull Day", "Push Day"]);
  });

  it("replays the five-placement, four-workout production shape and isolates only Pull Day and Push Day", () => {
    const studio = workout("30d9f9ea-65d5-48cb-b799-2e0e17ff85d4", "Studio Bidirectional Acceptance");
    const andy = workout("f4d59fd1-7b6a-4f8c-84e9-395e55ec2fca", "Andy Test Workout");
    const pull = { ...workout("template_d0333e99e198", "Pull Day"), blocks: [] };
    const push = { ...workout("template_push", "Push Day"), blocks: [] };
    const fixture = plan([studio.workoutId, andy.workoutId, pull.workoutId, push.workoutId, andy.workoutId]);
    expect(fixture.weeks[0].placements).toHaveLength(5);
    expect(validatePlanPublicationDependencies(fixture, [studio, andy, pull, push], new Set([studio.workoutId, andy.workoutId])).map(item => item.entityId)).toEqual([pull.workoutId, push.workoutId]);
  });

  it("accepts a valid Android-reconstructed workout", () => {
    expect(validatePlanPublicationDependencies(plan(["android_valid"]), [workout("android_valid", "Valid")], new Set())).toEqual([]);
  });

  it("reports a missing required workout reference", () => {
    expect(validatePlanPublicationDependencies(plan(["missing"]), [])).toMatchObject([{ entityId: "missing", fieldPath: "placement.workoutId", validationRule: "WORKOUT_REFERENCE_RESOLVES" }]);
  });

  it("reports the stable block and field for a missing exercise reference", () => {
    const item = workout("bad_ref", "Bad reference"); (item.blocks[0] as { exerciseId: string }).exerciseId = "";
    expect(validatePlanPublicationDependencies(plan([item.workoutId]), [item])).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "bad_ref", fieldPath: "blocks[bad_ref_block].exerciseId", validationRule: "EXERCISE_REFERENCE_REQUIRED" })]));
  });

  it("reports missing set content without inventing a set", () => {
    const item = workout("bad_set", "Bad set"); (item.blocks[0] as { efforts: unknown[] }).efforts = [];
    expect(validatePlanPublicationDependencies(plan([item.workoutId]), [item])).toEqual(expect.arrayContaining([expect.objectContaining({ entityId: "bad_set", fieldPath: "blocks[bad_set_block].efforts", validationRule: "SET_CONTENT_REQUIRED" })]));
  });

  it("preserves repeated placements while validating a dependency once", () => {
    const item = workout("repeat", "Repeated");
    expect(plan(["repeat", "repeat"]).weeks[0].placements).toHaveLength(2);
    expect(validatePlanPublicationDependencies(plan(["repeat", "repeat"]), [item])).toEqual([]);
  });

  it("accepts four unique workouts across five placements", () => {
    const ids = ["one", "two", "three", "four", "one"];
    expect(validatePlanPublicationDependencies(plan(ids), ids.slice(0, 4).map(id => workout(id, id)))).toEqual([]);
  });

  it("marks a local malformed draft as reviewable but never directly retryable", () => {
    const item = { ...workout("local", "Local draft"), blocks: [] };
    expect(validatePlanPublicationDependencies(plan(["local"]), [item], new Set(["local"]))).toMatchObject([{ userCorrectableInStudio: true, sourceMigrationRequired: false, retryEligibility: "NOT_RETRYABLE" }]);
  });
});
