import { get, set } from "idb-keyval";
import { sha256 } from "js-sha256";
import { canonicalJson } from "../domain/canonical";
import { assertMutationAllowed } from "../config/mutationPolicy";
import type { Plan, PlanPhase, PlanPlacement, PlanWeek, Workout } from "../domain/types";
import type { RegisteredStarterPack } from "../domain/starterPack";
import { starterPackChecksum, validateRegisteredStarterPack } from "../domain/starterPack";
import { registeredStarterPacks } from "../fixtures/representativeStarterPack";
import { governedWorkoutImportAdapter, type GovernedWorkoutImportAdapter } from "./GovernedWorkoutImportAdapter";
import { draftRepository, type DraftEnvelope, type DraftRepository } from "./DraftRepository";
import { syncManager, type SyncManager } from "./SyncManager";

export type StarterPackImportPhase = "CHECKING_LIBRARY" | "ADDING_WORKOUTS" | "CREATING_PLAN" | "ADDED" | "ALREADY_ADDED" | "NEEDS_ATTENTION";
export interface StarterPackOperationState {
  schemaVersion: 1;
  packId: string;
  datasetVersion: string;
  contentChecksum: string;
  owner: string;
  phase: StarterPackImportPhase;
  selectedStartDate: string;
  completedWorkoutCount: number;
  planId: string;
  updatedAt: string;
  errorCode?: string;
  affectedWorkoutName?: string;
}
export interface StarterPackPreview {
  packId: string; name: string; description: string; intendedAudience: string; workoutNames: string[];
  workoutCount: number; planName: string | null; weekCount: number; placementCount: number; disciplines: string[];
}
export interface StarterPackImportResult { state: StarterPackOperationState; createdWorkouts: number; unchangedWorkouts: number }

export interface ImportDependencies {
  importer: Pick<GovernedWorkoutImportAdapter, "dryRun" | "apply">;
  drafts: Pick<DraftRepository, "listWorkoutEnvelopes" | "getPlanEnvelope" | "savePlanDraft">;
  sync: Pick<SyncManager, "syncDown" | "syncPending" | "listSyncRecords">;
  readState: (key: string) => Promise<StarterPackOperationState | undefined>;
  writeState: (key: string, state: StarterPackOperationState) => Promise<void>;
  now: () => Date;
  registry: ReadonlyMap<string, RegisteredStarterPack>;
  afterWorkoutSaved?: (createdCount: number) => Promise<void>;
}

const defaultDependencies: ImportDependencies = {
  importer: governedWorkoutImportAdapter,
  drafts: draftRepository,
  sync: syncManager,
  readState: key => get<StarterPackOperationState>(key),
  writeState: (key, state) => set(key, state),
  now: () => new Date(),
  registry: registeredStarterPacks,
  afterWorkoutSaved: import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true" ? async createdCount => {
    const hook = (window as unknown as { __HV1_STARTER_PACK_AFTER_WORKOUT_SAVED__?: (count: number) => Promise<void> }).__HV1_STARTER_PACK_AFTER_WORKOUT_SAVED__;
    await hook?.(createdCount);
  } : undefined,
};

const planIdFor = (pack: RegisteredStarterPack) => `plan_${sha256(`humanv1.registered-starter-pack/1|${pack.packId}|${pack.datasetVersion}|${pack.planManifest?.semanticKey ?? "no-plan"}`).slice(0, 24)}`;
const stableId = (kind: string, pack: RegisteredStarterPack, semanticPath: string) => `${kind}_${sha256(`humanv1.registered-starter-pack/1|${pack.packId}|${pack.datasetVersion}|${semanticPath}`).slice(0, 24)}`;
const firstMondayAfter = (date: Date) => {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const days = ((8 - result.getUTCDay()) % 7) || 7;
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const addDays = (date: string, days: number) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const safeError = (error: unknown) => error instanceof Error && /^[A-Z0-9_:.-]+$/.test(error.message) ? error.message.slice(0, 180) : "STARTER_PACK_IMPORT_FAILED";

function buildPlan(pack: RegisteredStarterPack, owner: string, workoutBySemanticKey: ReadonlyMap<string, DraftEnvelope<Workout>>, startDate: string): Plan {
  const manifest = pack.planManifest;
  if (!manifest) throw new Error("STARTER_PACK_PLAN_REQUIRED");
  if ([...workoutBySemanticKey.values()].some(value => !value || value.deletedAt)) throw new Error("STARTER_PACK_WORKOUT_DEPENDENCY_MISSING");
  const weeks: PlanWeek[] = manifest.weeks.map((week, index) => ({
    weekId: stableId("week", pack, week.semanticKey), weekNumber: index + 1, label: week.recoveryWeek ? `${week.label} · Recovery` : week.label,
    placements: week.placements.map(item => {
      const envelope = workoutBySemanticKey.get(item.workoutSemanticKey)!;
      const placementId = stableId("placement", pack, `${week.semanticKey}/${item.semanticKey}`);
      return { placementId, dayOfWeek: item.dayOfWeek, workoutId: envelope.globalId, preferredMinuteOfDay: item.preferredMinuteOfDay ?? null,
        reminderEnabled: false, notes: item.notes ?? "", dependency: { kind: "WORKOUT_DRAFT", workoutDraftId: envelope.globalId,
          humanUserId: owner, expectedRevision: envelope.revision, expectedUpdatedAt: envelope.updatedAt, displayName: envelope.payload.title,
          originApplication: "WORKOUT_STUDIO" } } satisfies PlanPlacement;
    }),
  }));
  const phases: PlanPhase[] = [
    { phaseId: stableId("phase", pack, "foundation"), name: "Foundation", objective: "Establish sustainable aerobic and strength consistency.", order: 1, weekNumbers: [1,2,3], source: "CANONICAL_PLAN" },
    { phaseId: stableId("phase", pack, "recovery-1"), name: "Recovery", objective: "Reduce load while maintaining movement quality.", order: 2, weekNumbers: [4], source: "CANONICAL_PLAN" },
    { phaseId: stableId("phase", pack, "build"), name: "Build", objective: "Progress aerobic durability and controlled intensity.", order: 3, weekNumbers: [5,6,7], source: "CANONICAL_PLAN" },
    { phaseId: stableId("phase", pack, "recovery-2"), name: "Recovery", objective: "Consolidate adaptation before the final block.", order: 4, weekNumbers: [8], source: "CANONICAL_PLAN" },
    { phaseId: stableId("phase", pack, "consolidation"), name: "Consolidation", objective: "Finish with a lighter transition into the next phase.", order: 5, weekNumbers: [9,10], source: "CANONICAL_PLAN" },
  ];
  const dependencyCount = weeks.reduce((sum, week) => sum + week.placements.length, 0);
  return { schemaVersion: "humanv1.studio-plan-draft/1", planId: planIdFor(pack), title: manifest.title, description: manifest.description,
    startDate, endDate: addDays(startDate, 69), timezone: manifest.timezone, phases, weeks, dependencyOwnerHumanUserId: owner,
    dependencyKinds: ["WORKOUT_DRAFT"], dependencyStorageVersion: 1, dependencyCount,
    notes: `${pack.name}. Everything remains editable and nothing is sent to a device automatically.` };
}

export class StarterPackImportRepository {
  private inFlight = new Map<string, Promise<StarterPackImportResult>>();
  constructor(private dependencies: ImportDependencies = defaultDependencies) {}

  preview(packId: string): StarterPackPreview {
    const pack = this.registered(packId);
    const placements = pack.planManifest?.weeks.flatMap(week => week.placements) ?? [];
    return { packId, name: pack.name, description: pack.description, intendedAudience: pack.intendedAudience,
      workoutNames: pack.workoutManifest.workouts.map(workout => workout.title), workoutCount: pack.workoutManifest.workouts.length,
      planName: pack.planManifest?.title ?? null, weekCount: pack.planManifest?.weeks.length ?? 0, placementCount: placements.length,
      disciplines: [...new Set(pack.workoutManifest.workouts.map(workout => workout.discipline))].sort() };
  }

  async operationState(owner: string, packId: string) { return this.dependencies.readState(this.stateKey(owner, packId)); }

  import(owner: string, packId: string, confirmation: string, onProgress?: (state: StarterPackOperationState) => void): Promise<StarterPackImportResult> {
    assertMutationAllowed("importRegisteredStarterPack");
    if (confirmation !== "ADD STARTER PACK") return Promise.reject(new Error("STARTER_PACK_CONFIRMATION_REQUIRED"));
    const key = `${owner}|${packId}`;
    const active = this.inFlight.get(key); if (active) return active;
    const operation = this.runImport(owner, packId, onProgress).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation); return operation;
  }

  private async runImport(owner: string, packId: string, onProgress?: (state: StarterPackOperationState) => void): Promise<StarterPackImportResult> {
    const pack = this.registered(packId); const key = this.stateKey(owner, packId); const previous = await this.dependencies.readState(key);
    if (previous && previous.contentChecksum !== pack.contentChecksum) throw new Error("STARTER_PACK_CONTENT_CONFLICT");
    let state: StarterPackOperationState = previous ?? { schemaVersion: 1, packId, datasetVersion: pack.datasetVersion, contentChecksum: pack.contentChecksum,
      owner, phase: "CHECKING_LIBRARY", selectedStartDate: firstMondayAfter(this.dependencies.now()), completedWorkoutCount: 0,
      planId: planIdFor(pack), updatedAt: this.dependencies.now().toISOString() };
    const update = async (phase: StarterPackImportPhase, changes: Partial<StarterPackOperationState> = {}) => {
      state = { ...state, ...changes, phase, updatedAt: this.dependencies.now().toISOString() }; await this.dependencies.writeState(key, state); onProgress?.(state);
    };
    let workoutNameById = new Map<string, string>();
    try {
      await update("CHECKING_LIBRARY");
      await this.dependencies.sync.syncDown(owner, ["workout", "plan"]);
      const validation = await this.dependencies.importer.dryRun(pack.workoutManifest);
      workoutNameById = new Map(validation.documents.map(item => [item.workout.workoutId, item.workout.title]));
      if (!pack.compatibleCatalogueReleaseIds.includes(validation.releaseId)) throw new Error("STARTER_PACK_CATALOGUE_RELEASE_MISMATCH");
      await update("ADDING_WORKOUTS");
      const result = await this.dependencies.importer.apply(pack.workoutManifest, owner, this.dependencies.afterWorkoutSaved);
      await this.dependencies.sync.syncPending();
      const workoutIds = new Set(result.documents.map(item => item.workout.workoutId));
      await this.dependencies.sync.syncDown(owner, ["workout"]);
      const envelopes = (await this.dependencies.drafts.listWorkoutEnvelopes(owner)).filter(item => workoutIds.has(item.globalId));
      if (envelopes.length !== workoutIds.size || result.documents.some(item => canonicalJson(envelopes.find(env => env.globalId === item.workout.workoutId)?.payload) !== canonicalJson(item.workout))) throw new Error("STARTER_PACK_WORKOUT_CONTENT_MISMATCH");
      const envelopeById = new Map(envelopes.map(item => [item.globalId, item] as const));
      const workoutBySemanticKey = new Map(pack.workoutManifest.workouts.map((spec, index) => [spec.semanticKey, envelopeById.get(result.documents[index].workout.workoutId)!] as const));
      await update("CREATING_PLAN", { completedWorkoutCount: workoutIds.size });
      const plan = buildPlan(pack, owner, workoutBySemanticKey, state.selectedStartDate);
      const existingPlan = await this.dependencies.drafts.getPlanEnvelope(owner, plan.planId);
      if (existingPlan && !existingPlan.deletedAt) {
        if (canonicalJson(existingPlan.payload) !== canonicalJson(plan)) throw new Error(`STARTER_PACK_PLAN_CONFLICT:${plan.planId}`);
        await update(previous?.phase === "ADDED" || previous?.phase === "ALREADY_ADDED" ? "ALREADY_ADDED" : "ADDED");
        return { state, createdWorkouts: result.created, unchangedWorkouts: result.unchanged };
      }
      await this.dependencies.drafts.savePlanDraft(owner, plan);
      await this.dependencies.sync.syncPending();
      const planRecord = (await this.dependencies.sync.listSyncRecords(owner, "plan")).find(item => item.envelope.globalId === plan.planId);
      if (planRecord?.status !== "SYNCED") throw new Error(`STARTER_PACK_PLAN_SAVE_INCOMPLETE:${planRecord?.status ?? "MISSING"}:${planRecord?.attention?.technicalCode ?? planRecord?.lastErrorCode ?? "NO_ERROR_CODE"}`);
      await update("ADDED");
      return { state, createdWorkouts: result.created, unchangedWorkouts: result.unchanged };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const affectedWorkoutName = [...workoutNameById].find(([id]) => message.includes(id))?.[1];
      await update("NEEDS_ATTENTION", { errorCode: safeError(error), ...(affectedWorkoutName ? { affectedWorkoutName } : {}) }); throw error;
    }
  }

  private registered(packId: string) {
    const pack = this.dependencies.registry.get(packId); if (!pack) throw new Error("UNREGISTERED_STARTER_PACK");
    if (starterPackChecksum(pack) !== pack.contentChecksum) throw new Error("STARTER_PACK_CHECKSUM_MISMATCH");
    if (pack.workoutManifest.datasetVersion !== pack.datasetVersion) throw new Error("STARTER_PACK_VERSION_MISMATCH");
    if (!pack.compatibleCatalogueReleaseIds.length) throw new Error("STARTER_PACK_CATALOGUE_COMPATIBILITY_REQUIRED");
    validateRegisteredStarterPack(pack);
    return pack;
  }
  private stateKey(owner: string, packId: string) { return `starter_pack_operation_${owner}_${packId}`; }
}

export const starterPackImportRepository = new StarterPackImportRepository();
