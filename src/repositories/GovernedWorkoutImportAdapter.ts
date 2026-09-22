import { canonicalJson } from "../domain/canonical";
import type { Exercise } from "../domain/catalogue";
import type { Workout } from "../domain/types";
import { validateWorkoutForPublication } from "../domain/validation/workoutValidation";
import { createWorkoutDraft, type WorkoutDraftInput } from "../domain/workoutDraftFactory";
import { authRepository } from "./AuthManager";
import { catalogueRepository } from "./FirebaseCatalogueRepository";
import { draftRepository, type DraftEnvelope, type DraftRepository } from "./DraftRepository";

export interface GovernedWorkoutImportManifest {
  schemaVersion: "humanv1.governed-workout-import/1";
  operationNamespace: string;
  datasetVersion: string;
  workouts: Array<Omit<WorkoutDraftInput, "strategy" | "importNamespace" | "datasetVersion" | "catalogueReleaseId">>;
}
export interface WorkoutImportDocument { path: `workoutDrafts/${string}`; workout: Workout }
export interface WorkoutImportDryRun { releaseId: string; documents: WorkoutImportDocument[] }
export interface WorkoutImportResult extends WorkoutImportDryRun { created: number; unchanged: number }

type CatalogueBoundary = Pick<typeof catalogueRepository, "getActiveReleaseId" | "getExercises">;
type DraftBoundary = Pick<DraftRepository, "listWorkoutEnvelopes" | "saveWorkoutDraft">;

export class GovernedWorkoutImportAdapter {
  constructor(
    private drafts: DraftBoundary = draftRepository,
    private catalogue: CatalogueBoundary = catalogueRepository,
    private authenticatedOwner = async () => (await authRepository.getCurrentIdentity())?.humanUserId ?? null,
  ) {}

  async dryRun(manifest: GovernedWorkoutImportManifest): Promise<WorkoutImportDryRun> {
    if (manifest.schemaVersion !== "humanv1.governed-workout-import/1" || !manifest.workouts.length) throw new Error("INVALID_GOVERNED_IMPORT_MANIFEST");
    const [releaseId, catalogue] = await Promise.all([this.catalogue.getActiveReleaseId(), this.catalogue.getExercises()]);
    const catalogueIds = new Set(catalogue.filter(exercise => exercise.provenance?.archived !== true).map(exercise => exercise.exerciseId));
    const seen = new Set<string>();
    const documents = manifest.workouts.map(spec => {
      const workout = createWorkoutDraft({ ...spec, strategy: "GOVERNED_IMPORT", importNamespace: manifest.operationNamespace, datasetVersion: manifest.datasetVersion, catalogueReleaseId: releaseId });
      if (seen.has(workout.workoutId)) throw new Error("DUPLICATE_WORKOUT_ID");
      seen.add(workout.workoutId);
      for (const block of workout.blocks) {
        const exercises = block.type === "EXERCISE" ? [block] : block.type === "SUPERSET" || block.type === "CIRCUIT" ? block.exercises : [];
        for (const exercise of exercises) if (!catalogueIds.has(exercise.exerciseId)) {
          throw new Error(`INVALID_GOVERNED_WORKOUT:${workout.workoutId}:UNKNOWN_EXERCISE_REFERENCE:${exercise.exerciseId}`);
        }
      }
      const issues = validateWorkoutForPublication(workout, catalogue);
      if (issues.length) throw new Error(`INVALID_GOVERNED_WORKOUT:${workout.workoutId}:${issues[0].rule ?? issues[0].message}`);
      return { path: `workoutDrafts/${workout.workoutId}` as const, workout };
    });
    return { releaseId, documents };
  }

  async apply(manifest: GovernedWorkoutImportManifest, expectedOwner?: string, afterWorkoutSaved?: (createdCount: number) => Promise<void>): Promise<WorkoutImportResult> {
    const owner = await this.authenticatedOwner();
    if (!owner) throw new Error("AUTHENTICATED_OWNER_REQUIRED");
    if (expectedOwner && owner !== expectedOwner) throw new Error("AUTHENTICATED_OWNER_MISMATCH");
    const dryRun = await this.dryRun(manifest);
    const existing = new Map((await this.drafts.listWorkoutEnvelopes(owner)).map(item => [item.globalId, item] as const));
    let created = 0; let unchanged = 0;
    for (const document of dryRun.documents) {
      const current = existing.get(document.workout.workoutId) as DraftEnvelope<Workout> | undefined;
      if (current) {
        if (current.deletedAt || canonicalJson(current.payload) !== canonicalJson(document.workout)) throw new Error(`GOVERNED_IMPORT_IDENTITY_CONFLICT:${document.workout.workoutId}`);
        unchanged++;
      }
    }
    for (const document of dryRun.documents) if (!existing.has(document.workout.workoutId)) {
      await this.drafts.saveWorkoutDraft(owner, document.workout);
      created++;
      await afterWorkoutSaved?.(created);
    }
    return { ...dryRun, created, unchanged };
  }
}

export const governedWorkoutImportAdapter = new GovernedWorkoutImportAdapter();
