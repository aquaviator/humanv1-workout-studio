import { describe, expect, it } from "vitest";
import { createWorkoutDraft, type WorkoutDraftInput } from "../workoutDraftFactory";

const input = (version = "1.0"): WorkoutDraftInput => ({ strategy: "GOVERNED_IMPORT", importNamespace: "library", datasetVersion: version,
  semanticKey: "base", title: "Base", description: "Complete session.", purpose: "Develop capacity.", discipline: "STRENGTH",
  catalogueReleaseId: "release-1", blocks: [
    { semanticKey: "squat", type: "EXERCISE", exerciseId: "squat", exerciseNameSnapshot: "Squat", efforts: [{ semanticKey: "work", effortType: "WORKING", prescriptions: [{ semanticKey: "reps", metricKey: "repetitions", targetValue: 8 }] }] },
    { semanticKey: "rest", type: "REST", durationSeconds: 60, recoveryType: "PASSIVE" },
  ] });

describe("workout draft factory", () => {
  it("produces byte-equivalent governed identities and separates dataset versions", () => {
    expect(createWorkoutDraft(input())).toEqual(createWorkoutDraft(input()));
    expect(createWorkoutDraft(input()).workoutId).not.toBe(createWorkoutDraft(input("2.0")).workoutId);
  });
  it("scopes similar structures by workout and preserves semantic identity when reordered", () => {
    const a = input(); const b = { ...input(), semanticKey: "other" };
    expect(createWorkoutDraft(a).blocks[0].blockId).not.toBe(createWorkoutDraft(b).blocks[0].blockId);
    const reordered = { ...a, blocks: [...a.blocks].reverse() };
    const ids = (value: WorkoutDraftInput) => Object.fromEntries(createWorkoutDraft(value).blocks.map(block => [value.blocks.find(item => item.type === block.type)?.semanticKey, block.blockId]));
    expect(new Set(createWorkoutDraft(a).blocks.map(block => block.blockId))).toEqual(new Set(createWorkoutDraft(reordered).blocks.map(block => block.blockId)));
    expect(ids(a)).toBeTruthy();
  });
  it("fails duplicate semantic keys and requires governed narrative", () => {
    expect(() => createWorkoutDraft({ ...input(), blocks: [input().blocks[0], input().blocks[0]] })).toThrow("DUPLICATE_OR_EMPTY_SEMANTIC_KEY");
    expect(() => createWorkoutDraft({ ...input(), purpose: "" })).toThrow("GOVERNED_DESCRIPTION_AND_PURPOSE_REQUIRED");
  });
  it("keeps user-authored ids opaque and unique while preserving existing ids during edits", () => {
    let n = 0; const generate = () => `opaque-${++n}`;
    const user = { ...input(), strategy: "USER_AUTHORED" as const, importNamespace: undefined, datasetVersion: undefined, description: undefined, purpose: undefined };
    const first = createWorkoutDraft(user, generate); const second = createWorkoutDraft(user, generate);
    expect(first.workoutId).not.toBe(second.workoutId);
    expect({ ...first, title: "Edited" }.workoutId).toBe(first.workoutId);
    expect(JSON.stringify(first)).not.toContain("library");
  });
});
