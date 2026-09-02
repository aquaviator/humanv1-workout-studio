import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { CrossAppRepository } from "../CrossAppRepository";

describe("CrossAppRepository", () => {
  beforeEach(() => clear());

  it("reconstructs an app routine losslessly enough for editing without sessions", async () => {
    const records: Record<string, Record<string, unknown>[]> = {
      templates: [{ globalId: "routine_1", humanUserId: "human_1", name: "App routine", revision: 2, deletedAt: null }],
      templateExercises: [{ globalId: "slot_1", humanUserId: "human_1", templateGlobalId: "routine_1", exerciseId: "private_12345678", position: 0, restSeconds: 45, deletedAt: null, extensions: { exerciseNameSnapshot: "Private row" } }],
      templateSets: [{ globalId: "set_1", humanUserId: "human_1", templateExerciseGlobalId: "slot_1", position: 1, setType: "TIMED", targetDurationSeconds: 90, deletedAt: null }],
    };
    const repo = new CrossAppRepository(async (_owner, name) => records[name] || [], async () => {}, () => true);
    const [workout] = await repo.listAppWorkouts("human_1");
    expect(workout.workoutId).toBe("routine_1");
    expect(workout.blocks[0]).toMatchObject({ exerciseId: "private_12345678", exerciseNameSnapshot: "Private row", efforts: [{ effortType: "TIMED", prescriptions: [{ metricKey: "duration", targetValue: 90 }] }] });
  });

  it("owner-filters private records and retains archived snapshots", async () => {
    const repo = new CrossAppRepository(async () => [
      { globalId: "custom_12345678", id: "custom_12345678", humanUserId: "human_1", isCustom: true, name: "Mine", category: "Mobility", revision: 3, createdAt: 1, updatedAt: 2, deletedAt: 2 },
      { globalId: "custom_87654321", id: "custom_87654321", humanUserId: "human_2", isCustom: true, name: "Other", category: "Strength" },
      { globalId: "squat", id: "squat", humanUserId: "human_1", isCustom: false, name: "Governed", category: "Strength" },
    ], async () => {}, () => true);
    const items = await repo.listPrivateExercises("human_1", true);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ exerciseId: "custom_12345678", syncState: "Archived", provenance: { ownerHumanUserId: "human_1" } });
  });

  it("creates an owner-bound private namespace record and is idempotent at a revision", async () => {
    const writes: Array<{ owner: string; name: string; id: string; value: Record<string, unknown> }> = [];
    const repo = new CrossAppRepository(async () => [], async (owner, name, id, value) => { writes.push({ owner, name, id, value }); }, () => true);
    const item = await repo.savePrivateExercise("human_1", { name: "Run drill", category: "Cardio", metricProfile: { primary: ["duration", "distance"], secondary: [], optional: [], unsupported: ["external_load"] } });
    expect(item.exerciseId).toMatch(/^private_/);
    expect(writes[0]).toMatchObject({ owner: "human_1", name: "customExercises", id: item.exerciseId, value: { humanUserId: "human_1", isCustom: true, revision: 1 } });
  });

  it("reconstructs plans with stable occurrence identifiers", async () => {
    const repo = new CrossAppRepository(async (_owner, name) => name === "trainingPlans" ? [{ globalId: "plan_1", humanUserId: "human_1", routineName: "Plan", deletedAt: null }] : [{ globalId: "occurrence_1", humanUserId: "human_1", seriesId: "plan_1", templateGlobalId: "routine_1", scheduledEpochDay: 20000, reminderEnabled: true, deletedAt: null }], async () => {}, () => true);
    const [plan] = await repo.listAppPlans("human_1");
    expect(plan.weeks[0].placements[0]).toMatchObject({ placementId: "occurrence_1", workoutId: "routine_1", reminderEnabled: true });
  });
});
