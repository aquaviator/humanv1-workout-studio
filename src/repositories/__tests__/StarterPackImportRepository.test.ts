import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkoutDraft } from "../../domain/workoutDraftFactory";
import { canonicalJson } from "../../domain/canonical";
import { representativeStarterPack } from "../../fixtures/representativeStarterPack";
import { StarterPackImportRepository, type StarterPackOperationState } from "../StarterPackImportRepository";
import { normalizePlanDependencyRecords } from "../../domain/planDraftDependencies";

const documents = representativeStarterPack.workoutManifest.workouts.map(spec => ({ path: "workoutDrafts/test" as const, workout: createWorkoutDraft({ ...spec, strategy: "GOVERNED_IMPORT", importNamespace: representativeStarterPack.workoutManifest.operationNamespace, datasetVersion: representativeStarterPack.datasetVersion, catalogueReleaseId: "strength-2026.08.36-v1" }) }));

function harness(interruptAt = 0) {
  const workouts: any[] = []; const dependencies: any[] = []; let plan: any; let applyCalls = 0; const states = new Map<string, StarterPackOperationState>();
  const savePlanDraft = vi.fn(async (owner: string, payload: any) => {
    const revision = (plan?.revision ?? 0) + 1; const createdAt = plan?.createdAt ?? "2026-09-22T00:00:00.000Z"; const updatedAt = `2026-09-22T00:00:0${revision}.000Z`;
    plan = { schemaVersion: 1, globalId: payload.planId, humanUserId: owner, revision, status: "DRAFT", payload, createdAt, updatedAt, deletedAt: null, originClientId: "test" };
    dependencies.splice(0, dependencies.length, ...normalizePlanDependencyRecords(payload, owner, revision, createdAt, updatedAt));
  });
  const importer = {
    dryRun: vi.fn(async () => ({ releaseId: "strength-2026.08.36-v1", documents })),
    apply: vi.fn(async (_manifest: any, owner: string) => {
      applyCalls++;
      for (const document of documents) if (!workouts.some(item => item.globalId === document.workout.workoutId)) {
        workouts.push({ globalId: document.workout.workoutId, humanUserId: owner, revision: 1, updatedAt: "2026-09-22T00:00:00.000Z", deletedAt: null, payload: document.workout });
        if (applyCalls === 1 && interruptAt && workouts.length === interruptAt) throw new Error("NETWORK_INTERRUPTED");
      }
      return { releaseId: "strength-2026.08.36-v1", documents, created: applyCalls === 1 ? documents.length : documents.length - interruptAt, unchanged: applyCalls === 1 ? 0 : interruptAt };
    }),
  };
  const repository = new StarterPackImportRepository({ importer: importer as any,
    drafts: { listWorkoutEnvelopes: async () => workouts, getPlanEnvelope: async () => plan, listPlanDependencyRecords: async () => dependencies, savePlanDraft },
    sync: { syncDown: vi.fn(async () => undefined), syncPending: vi.fn(async () => undefined), listSyncRecords: vi.fn(async (_owner, type) => type === "plan" && plan ? [{ envelope: plan, status: "SYNCED" }] : []) } as any,
    readState: async key => states.get(key), writeState: async (key, state) => { states.set(key, state); }, now: () => new Date("2026-09-22T12:00:00Z"), registry: new Map([[representativeStarterPack.packId, representativeStarterPack]]) });
  return { repository, workouts, dependencies, get plan() { return plan; }, setPlan(value: any) { plan = value; }, importer, savePlanDraft, states };
}

describe("StarterPackImportRepository", () => {
  beforeEach(() => { sessionStorage.clear(); window.history.replaceState({}, "", "/"); });
  it("creates no operation state or queue in read-only acceptance", async () => {
    const h = harness();
    window.history.replaceState({}, "", "/?acceptance=read-only");
    expect(() => h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK")).toThrow("READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED");
    expect(h.states.size).toBe(0); expect(h.importer.apply).not.toHaveBeenCalled(); expect(h.savePlanDraft).not.toHaveBeenCalled();
  });
  it("requires confirmation and rejects unregistered caller identities before writes", async () => {
    const h = harness();
    await expect(h.repository.import("owner", representativeStarterPack.packId, "yes")).rejects.toThrow("STARTER_PACK_CONFIRMATION_REQUIRED");
    await expect(h.repository.import("owner", "caller-supplied-pack", "ADD STARTER PACK")).rejects.toThrow("UNREGISTERED_STARTER_PACK");
    expect(h.workouts).toHaveLength(0); expect(h.savePlanDraft).not.toHaveBeenCalled();
  });
  it("resumes a partial workout interruption, creates the plan only after all eight, and replays unchanged", async () => {
    const h = harness(3);
    await expect(h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK")).rejects.toThrow("NETWORK_INTERRUPTED");
    expect(h.workouts).toHaveLength(3); expect(h.plan).toBeUndefined(); expect([...h.states.values()][0].phase).toBe("NEEDS_ATTENTION");
    const completed = await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    expect(h.workouts).toHaveLength(8); expect(h.savePlanDraft).toHaveBeenCalledTimes(1); expect(completed.state.phase).toBe("ADDED");
    const planSnapshot = canonicalJson(h.plan.payload);
    const replay = await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    expect(replay.state.phase).toBe("ALREADY_ADDED"); expect(h.savePlanDraft).toHaveBeenCalledTimes(1); expect(canonicalJson(h.plan.payload)).toBe(planSnapshot);
  });
  it("collapses double activation into one operation", async () => {
    const h = harness();
    const first = h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    const second = h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    await Promise.all([first, second]);
    expect(h.importer.apply).toHaveBeenCalledTimes(1); expect(h.savePlanDraft).toHaveBeenCalledTimes(1);
  });
  it("repairs one missing dependency with one callable-bound save", async () => {
    const h = harness(); await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    h.dependencies.pop(); h.savePlanDraft.mockClear();
    const result = await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    expect(result.state.phase).toBe("ADDED"); expect(h.savePlanDraft).toHaveBeenCalledTimes(1); expect(h.dependencies).toHaveLength(57);
  });
  it("reports a conflicting authoritative plan without invoking the callable", async () => {
    const h = harness(); await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    h.plan.payload.title = "User-edited plan"; h.savePlanDraft.mockClear();
    await expect(h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK")).rejects.toThrow("STARTER_PACK_PLAN_CONFLICT");
    expect(h.savePlanDraft).not.toHaveBeenCalled(); expect([...h.states.values()][0].phase).toBe("NEEDS_ATTENTION");
  });
  it("reconstructs complete authoritative state after reload or stale sending without a save", async () => {
    const h = harness(); await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK"); h.savePlanDraft.mockClear();
    const state = [...h.states.values()][0]; state.phase = "CREATING_PLAN"; await h.states.set([...h.states.keys()][0], state);
    const reloaded = await h.repository.import("owner", representativeStarterPack.packId, "ADD STARTER PACK");
    expect(reloaded.state.phase).toBe("ALREADY_ADDED"); expect(h.savePlanDraft).not.toHaveBeenCalled();
  });
});
