import { sha256 } from "js-sha256";
import { canonicalJson } from "./canonical";
import type { GovernedWorkoutImportManifest } from "../repositories/GovernedWorkoutImportAdapter";

export interface StarterPackSchedulePlacement {
  semanticKey: string;
  workoutSemanticKey: string;
  dayOfWeek: number;
  preferredMinuteOfDay?: number;
  notes?: string;
}

export interface StarterPackWeek {
  semanticKey: string;
  label: string;
  recoveryWeek: boolean;
  placements: StarterPackSchedulePlacement[];
}

export interface StarterPackPlanManifest {
  semanticKey: string;
  title: string;
  description: string;
  timezone: string;
  weeks: StarterPackWeek[];
}

export interface RegisteredStarterPack {
  schemaVersion: "humanv1.registered-starter-pack/1";
  packId: string;
  datasetVersion: string;
  name: string;
  description: string;
  intendedAudience: string;
  workoutManifest: GovernedWorkoutImportManifest;
  planManifest?: StarterPackPlanManifest;
  compatibleCatalogueReleaseIds: string[];
  evidenceStatus: "PRODUCT_REVIEWED" | "RESEARCH_REVIEW_REQUIRED";
  prerequisites: string[];
  migrationPolicy: "FAIL_ON_DIFFERENT_CONTENT";
  idempotencyIdentity: string;
  contentChecksum: string;
}

export const starterPackChecksum = (pack: Omit<RegisteredStarterPack, "contentChecksum"> | RegisteredStarterPack) =>
  sha256(canonicalJson({ ...pack, contentChecksum: undefined }));

export const registeredPackId = (operationNamespace: string) => `starter_pack_${sha256(`humanv1.registered-starter-pack/1|${operationNamespace}`).slice(0, 24)}`;

export function validateRegisteredStarterPack(pack: RegisteredStarterPack): void {
  if (pack.schemaVersion !== "humanv1.registered-starter-pack/1" || !pack.packId || !pack.datasetVersion) throw new Error("INVALID_REGISTERED_STARTER_PACK");
  const workoutKeys = new Set<string>();
  const nestedKeys = new Set<string>();
  for (const workout of pack.workoutManifest.workouts) {
    if (workoutKeys.has(workout.semanticKey)) throw new Error("DUPLICATE_WORKOUT_SEMANTIC_KEY");
    workoutKeys.add(workout.semanticKey);
    for (const block of workout.blocks) {
      const blockKey = `${workout.semanticKey}/block/${block.semanticKey}`;
      if (nestedKeys.has(blockKey)) throw new Error("DUPLICATE_NESTED_SEMANTIC_KEY");
      nestedKeys.add(blockKey);
      const exercises = block.type === "EXERCISE" ? [block] : block.type === "SUPERSET" || block.type === "CIRCUIT" ? block.exercises : [];
      for (const exercise of exercises) {
        const exerciseKey = `${blockKey}/exercise/${exercise.semanticKey}`;
        if (nestedKeys.has(exerciseKey)) throw new Error("DUPLICATE_NESTED_SEMANTIC_KEY");
        nestedKeys.add(exerciseKey);
        for (const effort of exercise.efforts) {
          const effortKey = `${exerciseKey}/effort/${effort.semanticKey}`;
          if (nestedKeys.has(effortKey)) throw new Error("DUPLICATE_NESTED_SEMANTIC_KEY");
          nestedKeys.add(effortKey);
          for (const prescription of effort.prescriptions) {
            const prescriptionKey = `${effortKey}/prescription/${prescription.semanticKey}`;
            if (nestedKeys.has(prescriptionKey)) throw new Error("DUPLICATE_NESTED_SEMANTIC_KEY");
            nestedKeys.add(prescriptionKey);
          }
        }
      }
    }
  }
  for (const placement of pack.planManifest?.weeks.flatMap(week => week.placements) ?? []) if (!workoutKeys.has(placement.workoutSemanticKey)) throw new Error("UNKNOWN_PACK_WORKOUT_REFERENCE");
}
