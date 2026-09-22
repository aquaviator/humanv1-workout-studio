import { describe, expect, it, vi } from "vitest";
import type { Exercise } from "../../domain/catalogue";
import { representativeWorkoutManifest } from "../../fixtures/representativeWorkoutManifest";
import { GovernedWorkoutImportAdapter } from "../GovernedWorkoutImportAdapter";

vi.mock('../AuthManager', () => ({ authRepository: { getCurrentIdentity: vi.fn(async () => null) } }));
vi.mock('../FirebaseCatalogueRepository', () => ({ catalogueRepository: { getActiveReleaseId: vi.fn(), getExercises: vi.fn() } }));
vi.mock('../DraftRepository', () => ({ DraftRepository: class {}, draftRepository: { listWorkoutEnvelopes: vi.fn(), saveWorkoutDraft: vi.fn() } }));

const ids = [...new Set(representativeWorkoutManifest.workouts.flatMap(workout => workout.blocks.flatMap(block =>
  block.type === "EXERCISE" ? [block.exerciseId] : block.type === "SUPERSET" || block.type === "CIRCUIT" ? block.exercises.map(item => item.exerciseId) : [])))];
const exercises: Exercise[] = ids.map(exerciseId => ({ exerciseId, name: exerciseId, category: "fixture", equipment: [], aliases: [], metricProfile: { primary: ["repetitions", "duration", "distance"], secondary: [], optional: [], unsupported: [] } }));

describe("governed workout import adapter", () => {
  it("validates all eight representative workouts and replays without content changes", async () => {
    const envelopes: any[] = []; const save = vi.fn(async (_owner: string, workout: any) => envelopes.push({ globalId: workout.workoutId, payload: workout, deletedAt: null }));
    const adapter = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: async () => envelopes, saveWorkoutDraft: save } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => exercises }, async () => "human-owner");
    const dry = await adapter.dryRun(representativeWorkoutManifest);
    expect(dry.documents).toHaveLength(8);
    expect(new Set(dry.documents.flatMap(item => [item.workout.workoutId, ...item.workout.blocks.map(block => block.blockId)] )).size).toBeGreaterThan(8);
    expect((await adapter.apply(representativeWorkoutManifest)).created).toBe(8);
    const replay = await adapter.apply(representativeWorkoutManifest);
    expect(replay).toMatchObject({ created: 0, unchanged: 8 });
    expect(save).toHaveBeenCalledTimes(8);
  });
  it("fails before writes for missing catalogue content and changed stable identity", async () => {
    const save = vi.fn();
    const missing = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: async () => [], saveWorkoutDraft: save } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => [] }, async () => "owner");
    await expect(missing.apply(representativeWorkoutManifest)).rejects.toThrow("INVALID_GOVERNED_WORKOUT");
    expect(save).not.toHaveBeenCalled();
    const dryAdapter = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: async () => [], saveWorkoutDraft: save } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => exercises }, async () => "owner");
    const dry = await dryAdapter.dryRun(representativeWorkoutManifest);
    const conflict = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: async () => [{ globalId: dry.documents[0].workout.workoutId, payload: { ...dry.documents[0].workout, title: "Changed" }, deletedAt: null }] as any, saveWorkoutDraft: save } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => exercises }, async () => "owner");
    await expect(conflict.apply(representativeWorkoutManifest)).rejects.toThrow("GOVERNED_IMPORT_IDENTITY_CONFLICT");
  });
  it("denies use without an authenticated owner", async () => {
    const adapter = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: vi.fn(), saveWorkoutDraft: vi.fn() } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => exercises }, async () => null);
    await expect(adapter.apply(representativeWorkoutManifest)).rejects.toThrow("AUTHENTICATED_OWNER_REQUIRED");
  });
  it("fails closed before writes when the expected Human owner differs", async () => {
    const saveWorkoutDraft = vi.fn();
    const adapter = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: vi.fn(), saveWorkoutDraft } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => exercises }, async () => "human-owner-a");
    await expect(adapter.apply(representativeWorkoutManifest, "human-owner-b")).rejects.toThrow("AUTHENTICATED_OWNER_MISMATCH");
    expect(saveWorkoutDraft).not.toHaveBeenCalled();
  });
  it("rejects archived catalogue references before writes", async () => {
    const saveWorkoutDraft = vi.fn();
    const archived = exercises.map(item => item.exerciseId === "squat" ? { ...item, provenance: { archived: true } } : item);
    const adapter = new GovernedWorkoutImportAdapter({ listWorkoutEnvelopes: async () => [], saveWorkoutDraft } as any,
      { getActiveReleaseId: async () => "release-1", getExercises: async () => archived }, async () => "owner");
    await expect(adapter.apply(representativeWorkoutManifest)).rejects.toThrow("UNKNOWN_EXERCISE_REFERENCE:squat");
    expect(saveWorkoutDraft).not.toHaveBeenCalled();
  });
});
