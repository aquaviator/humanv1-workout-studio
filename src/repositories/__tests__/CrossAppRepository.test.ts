import { beforeEach, describe, expect, it } from "vitest";
import "fake-indexeddb/auto";
import { clear } from "idb-keyval";
import { CrossAppRepository, safeThreeWayMerge } from "../CrossAppRepository";

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

  it("does not fabricate an open set when Android source set content is absent", async () => {
    const records: Record<string, Record<string, unknown>[]> = {
      templates: [{ globalId: "template_no_sets", humanUserId: "human_1", name: "No sets", deletedAt: null }],
      templateExercises: [{ globalId: "slot_no_sets", humanUserId: "human_1", templateGlobalId: "template_no_sets", exerciseId: "squat", position: 0, deletedAt: null }],
      templateSets: [], customExercises: [],
    };
    const repo = new CrossAppRepository(async (_owner, name) => records[name] || [], async () => {}, () => true);
    const [item] = await repo.listAppWorkouts("human_1");
    expect(item.blocks[0]).toMatchObject({ blockId: "slot_no_sets", type: "EXERCISE", efforts: [] });
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

  it("accepts TEST ANDY's Android stable-id shape and preserves both ids on edit", async () => {
    const writes: Array<{ id: string; value: Record<string, unknown> }> = [];
    const cloud = { __id: "exercise_6cc2f8f0d0a5", globalId: "exercise_6cc2f8f0d0a5", id: "custom_3deb463a-eda2-416b-86ac-931463496ec9", humanUserId: "human_1", isCustom: true, name: "TEST ANDY", category: "Strength", revision: 1, createdAt: 1, updatedAt: 2, deletedAt: null };
    const repo = new CrossAppRepository(async () => [cloud], async (_owner, _name, id, value) => { writes.push({ id, value }); }, () => true);
    const [item] = await repo.listPrivateExercises("human_1");
    expect(item).toMatchObject({ exerciseId: "exercise_6cc2f8f0d0a5", name: "TEST ANDY", provenance: { sourceLocalId: "custom_3deb463a-eda2-416b-86ac-931463496ec9" } });
    await repo.savePrivateExercise("human_1", { ...item, name: "TEST ANDY edited" });
    expect(writes[0]).toMatchObject({ id: "exercise_6cc2f8f0d0a5", value: { globalId: "exercise_6cc2f8f0d0a5", id: "custom_3deb463a-eda2-416b-86ac-931463496ec9", humanUserId: "human_1", revision: 2 } });
  });

  it("rejects malformed Android ids and cross-owner records", async () => {
    const repo = new CrossAppRepository(async () => [
      { __id: "exercise_badshape1", globalId: "exercise_badshape1", id: "exercise_badshape1", humanUserId: "human_1", isCustom: true },
      { __id: "exercise_crossowner", globalId: "exercise_crossowner", id: "custom_12345678", humanUserId: "human_2", isCustom: true },
    ], async () => {}, () => true);
    expect(await repo.listPrivateExercises("human_1")).toEqual([]);
  });

  it("creates an owner-bound private namespace record and is idempotent at a revision", async () => {
    const writes: Array<{ owner: string; name: string; id: string; value: Record<string, unknown> }> = [];
    const repo = new CrossAppRepository(async () => [], async (owner, name, id, value) => { writes.push({ owner, name, id, value }); }, () => true);
    const item = await repo.savePrivateExercise("human_1", { name: "Run drill", category: "Cardio", metricProfile: { primary: ["duration", "distance"], secondary: [], optional: [], unsupported: ["external_load"] } });
    expect(item.exerciseId).toMatch(/^private_/);
    expect(writes[0]).toMatchObject({ owner: "human_1", name: "customExercises", id: item.exerciseId, value: { humanUserId: "human_1", isCustom: true, revision: 1 } });
  });

  it("reconstructs plans with stable occurrence identifiers", async () => {
    const repo = new CrossAppRepository(async (_owner, name) => name === "trainingPlans" ? [{ globalId: "plan_1", humanUserId: "human_1", routineName: "Plan", deletedAt: null }] : name === "plannedWorkouts" ? [{ globalId: "occurrence_1", humanUserId: "human_1", seriesId: "plan_1", templateGlobalId: "routine_1", scheduledEpochDay: 20000, reminderEnabled: true, deletedAt: null }] : [{ globalId: "routine_1", humanUserId: "human_1", deletedAt: null }], async () => {}, () => true);
    const [plan] = await repo.listAppPlans("human_1");
    expect(plan.weeks[0].placements[0]).toMatchObject({ placementId: "occurrence_1", workoutId: "routine_1", reminderEnabled: true });
  });

  it("projects an immutable two-week plan idempotently and preserves completed history", async () => {
    const records: Record<string, Record<string, unknown>[]> = { trainingPlans: [], plannedWorkouts: [] };
    const writes: string[] = [];
    const repo = new CrossAppRepository(async (_owner, name) => records[name] || [], async (_owner, name, id, value) => {
      writes.push(`${name}/${id}`); const target = records[name] ||= []; const index = target.findIndex(item => item.globalId === id);
      if (index >= 0) target[index] = value; else target.push(value);
    }, () => true);
    const plan = { schemaVersion: "humanv1.plan/1", planId: "plan_1", title: "Two weeks", description: "", startDate: "2026-09-14", timezone: "Europe/London", weeks: [
      { weekId: "w1", weekNumber: 1, label: "Week 1", placements: [
        { placementId: "p1", dayOfWeek: 1, workoutId: "a", workoutVersionId: "a_r1_hash", preferredMinuteOfDay: 540, reminderEnabled: true, notes: "note" },
        { placementId: "p2", dayOfWeek: 3, workoutId: "b", workoutVersionId: "b_r1_hash", preferredMinuteOfDay: null, reminderEnabled: false, notes: "" }] },
      { weekId: "w2", weekNumber: 2, label: "Week 2", placements: [
        { placementId: "p3", dayOfWeek: 1, workoutId: "a", workoutVersionId: "a_r1_hash", preferredMinuteOfDay: null, reminderEnabled: false, notes: "" }] },
    ] };
    const publication = { planVersionId: "plan_1_r1_hash", planChecksum: "a".repeat(64), planRevision: 1, workoutVersionIds: ["a_r1_hash", "b_r1_hash"], destinationApplication: "HUMAN_STRENGTH" as const };
    expect(await repo.deliverPublishedPlan("human_1", plan, publication)).toEqual({ queued: false, occurrences: 3 });
    expect(writes).toHaveLength(4);
    await repo.deliverPublishedPlan("human_1", plan, publication);
    expect(writes).toHaveLength(4);
    records.plannedWorkouts[0] = { ...records.plannedWorkouts[0], status: "COMPLETED", scheduledEpochDay: 1 };
    await repo.deliverPublishedPlan("human_1", { ...plan, weeks: [{ ...plan.weeks[0], placements: [{ ...plan.weeks[0].placements[0], dayOfWeek: 2 }, plan.weeks[0].placements[1]] }, plan.weeks[1]] }, { ...publication, planVersionId: "plan_1_r2_hash", planRevision: 2, planChecksum: "b".repeat(64) });
    expect(records.plannedWorkouts[0]).toMatchObject({ status: "COMPLETED", scheduledEpochDay: 1 });

    await clear(); let online = false; const replayed: string[] = [];
    const offlineRepo = new CrossAppRepository(async () => [], async (_owner, name, id) => { replayed.push(`${name}/${id}`); }, () => online);
    expect((await offlineRepo.deliverPublishedPlan("human_1", plan, publication)).queued).toBe(true);
    online = true;
    expect(await offlineRepo.replayPending("human_1")).toBe(4);
    expect(await offlineRepo.replayPending("human_1")).toBe(0);
    expect(new Set(replayed).size).toBe(4);
  });

  it("distinguishes missing and tombstoned workout parents during plan reconstruction", async () => {
    const records: Record<string, Record<string, unknown>[]> = {
      trainingPlans: [{ globalId: "plan_1", humanUserId: "human_1", routineName: "Plan", deletedAt: null }],
      plannedWorkouts: [
        { globalId: "o1", humanUserId: "human_1", seriesId: "plan_1", templateGlobalId: "missing", scheduledEpochDay: 1, deletedAt: null },
        { globalId: "o2", humanUserId: "human_1", seriesId: "plan_1", templateGlobalId: "archived", scheduledEpochDay: 2, deletedAt: null },
      ], templates: [{ globalId: "archived", humanUserId: "human_1", deletedAt: 4 }],
    };
    const repo = new CrossAppRepository(async (_owner, name) => records[name] || [], async () => {}, () => true);
    const [plan] = await repo.listAppPlans("human_1");
    expect(plan.reconstructionDiagnostics?.map(item => item.category)).toEqual(["MISSING_PARENT", "ARCHIVED_PARENT"]);
  });

  it("preserves all 22 archived-parent placements and their schedule evidence", async () => {
    const occurrences = Array.from({ length: 22 }, (_, index) => ({ globalId: `placement_${String(index + 1).padStart(2, "0")}`, humanUserId: "synthetic_owner", seriesId: "plan_73584f7d32644da293bae765c66c160f", templateGlobalId: "template_legs", scheduledEpochDay: 21000 + index, deletedAt: null }));
    const records: Record<string, Record<string, unknown>[]> = {
      trainingPlans: [{ globalId: "plan_73584f7d32644da293bae765c66c160f", humanUserId: "synthetic_owner", routineName: "Synthetic historical plan", deletedAt: null }],
      plannedWorkouts: occurrences,
      templates: [{ globalId: "template_legs", humanUserId: "synthetic_owner", name: "Archived legs", deletedAt: 20900 }],
    };
    const repo = new CrossAppRepository(async (_owner, name) => records[name] || [], async () => { throw new Error("read-only fixture must not write"); }, () => true);
    const [plan] = await repo.listAppPlans("synthetic_owner");
    expect(plan.weeks[0].placements).toHaveLength(22);
    expect(new Set(plan.weeks[0].placements.map(item => item.placementId)).size).toBe(22);
    expect(plan.weeks[0].placements[0]).toMatchObject({ placementId: "placement_01", workoutId: "template_legs", scheduledEpochDay: 21000 });
    expect(plan.reconstructionDiagnostics).toMatchObject([{ category: "ARCHIVED_PARENT", referenceId: "template_legs", displayName: "Archived legs" }]);
  });

  it("durably replays an offline private edit once after reconnect", async () => {
    let online = false; const writes: string[] = [];
    const repo = new CrossAppRepository(async () => [], async (_owner, collectionName, id) => { writes.push(`${collectionName}/${id}`); }, () => online);
    const item = await repo.savePrivateExercise("human_1", { name: "Offline", category: "Duration", metricProfile: { primary: ["duration"], secondary: [], optional: [], unsupported: [] } });
    expect(writes).toHaveLength(0);
    online = true;
    expect(await repo.replayPending("human_1")).toBe(1);
    expect(await repo.replayPending("human_1")).toBe(0);
    expect(writes).toEqual([`customExercises/${item.exerciseId}`]);
  });

  it("merges non-overlapping edits and refuses overlapping edits", () => {
    expect(safeThreeWayMerge({ name: "A", category: "Strength" }, { name: "Studio", category: "Strength" }, { name: "A", category: "Mobility" })).toEqual({ name: "Studio", category: "Mobility" });
    expect(() => safeThreeWayMerge({ name: "A" }, { name: "Studio" }, { name: "App" })).toThrow("OVERLAPPING_CONFLICT:name");
  });

  it("resolves a recorded conflict idempotently", async () => {
    const writes: Record<string, unknown>[] = [];
    const repo = new CrossAppRepository(async () => [], async (_owner, _collection, _id, value) => { writes.push(value); }, () => true);
    const conflict = { owner: "human_1", collectionName: "templates", id: "routine_1", base: { name: "A", revision: 1 }, studio: { name: "Studio", revision: 2 }, app: { name: "A", revision: 2 } };
    await repo.resolveConflict(conflict, "MERGE"); await repo.resolveConflict(conflict, "MERGE");
    expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ name: "Studio", revision: 3, humanUserId: "human_1" });
  });
});
