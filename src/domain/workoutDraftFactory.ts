import { sha256 } from "js-sha256";
import type { Block, Effort, ExerciseBlock, MetricPrescription, Workout } from "./types";

export type WorkoutDraftCreationStrategy = "USER_AUTHORED" | "GOVERNED_IMPORT";
export type IdGenerator = () => string;

export interface PrescriptionInput extends Omit<MetricPrescription, "prescriptionId"> { semanticKey: string }
export interface EffortInput extends Omit<Effort, "effortId" | "prescriptions"> { semanticKey: string; prescriptions: PrescriptionInput[] }
export interface ExerciseInput extends Omit<ExerciseBlock, "blockId" | "efforts"> { semanticKey: string; efforts: EffortInput[] }
type WithoutKeys<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type BlockInput =
  | ({ semanticKey: string } & Omit<Extract<Block, { type: "EXERCISE" }>, "blockId" | "efforts"> & { efforts: EffortInput[] })
  | ({ semanticKey: string; exercises: ExerciseInput[] } & WithoutKeys<Extract<Block, { type: "SUPERSET" | "CIRCUIT" }>, "blockId" | "exercises">)
  | ({ semanticKey: string } & WithoutKeys<Extract<Block, { type: "REST" | "TRANSITION" | "NOTE" }>, "blockId">);

export interface WorkoutDraftInput {
  strategy: WorkoutDraftCreationStrategy;
  importNamespace?: string;
  datasetVersion?: string;
  semanticKey: string;
  title: string;
  description?: string;
  purpose?: string;
  discipline: Workout["discipline"];
  estimatedDurationSeconds?: number;
  catalogueReleaseId: string;
  protocolReleaseId?: string;
  tags?: string[];
  blocks: BlockInput[];
}

const governedId = (input: WorkoutDraftInput, entityType: string, semanticPath: string) => {
  if (!input.importNamespace?.trim() || !input.datasetVersion?.trim()) throw new Error("GOVERNED_IMPORT_SCOPE_REQUIRED");
  const scope = ["humanv1.workout-draft/1", input.importNamespace, input.datasetVersion, entityType, input.semanticKey, semanticPath].join("|");
  return `${entityType}_${sha256(scope).slice(0, 24)}`;
};
const uniqueKeys = (items: Array<{ semanticKey: string }>, path: string) => {
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.semanticKey.trim();
    if (!key || seen.has(key)) throw new Error(`DUPLICATE_OR_EMPTY_SEMANTIC_KEY:${path}:${key}`);
    seen.add(key);
  }
};
export const createOpaqueDraftId = (entityType: string, generateId: IdGenerator = () => crypto.randomUUID()) =>
  `${entityType}_${generateId().replaceAll("-", "")}`;

export function createWorkoutDraft(input: WorkoutDraftInput, generateId: IdGenerator = () => crypto.randomUUID()): Workout {
  const governed = input.strategy === "GOVERNED_IMPORT";
  if (!input.semanticKey.trim() || !input.title.trim()) throw new Error("WORKOUT_IDENTITY_REQUIRED");
  if (governed && (!input.description?.trim() || !input.purpose?.trim())) throw new Error("GOVERNED_DESCRIPTION_AND_PURPOSE_REQUIRED");
  uniqueKeys(input.blocks, "blocks");
  const id = (type: string, path: string) => governed ? governedId(input, type, path) : createOpaqueDraftId(type, generateId);
  const makeEfforts = (items: EffortInput[], path: string): Effort[] => {
    uniqueKeys(items, `${path}/efforts`);
    return items.map(effort => {
      uniqueKeys(effort.prescriptions, `${path}/efforts/${effort.semanticKey}/prescriptions`);
      const { semanticKey, prescriptions, ...effortValue } = effort;
      return { ...effortValue, effortId: id("effort", `${path}/effort/${semanticKey}`), prescriptions: prescriptions.map(p => { const { semanticKey: prescriptionKey, ...value } = p; return { ...value, prescriptionId: id("prescription", `${path}/effort/${semanticKey}/prescription/${prescriptionKey}`) }; }) };
    });
  };
  const makeExercise = (exercise: ExerciseInput, path: string): ExerciseBlock => { const { semanticKey, efforts, ...value } = exercise; return { ...value, blockId: id("exercise", `${path}/exercise/${semanticKey}`), efforts: makeEfforts(efforts, `${path}/exercise/${semanticKey}`) }; };
  const blocks: Block[] = input.blocks.map(block => {
    const path = `block/${block.semanticKey}`;
    if (block.type === "EXERCISE") { const { semanticKey: _key, efforts, ...value } = block; return { ...value, blockId: id("block", path), efforts: makeEfforts(efforts, path) }; }
    if (block.type === "SUPERSET" || block.type === "CIRCUIT") {
      uniqueKeys(block.exercises, `${path}/exercises`);
      const { semanticKey: _key, exercises, ...value } = block;
      return { ...value, blockId: id("block", path), exercises: exercises.map(exercise => makeExercise(exercise, path)) } as Block;
    }
    const { semanticKey: _key, ...value } = block;
    return { ...value, blockId: id("block", path) } as Block;
  });
  return {
    schemaVersion: "humanv1.workout/1", workoutId: id("workout", "root"), title: input.title.trim(),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.purpose?.trim() ? { purpose: input.purpose.trim() } : {}),
    draftOrigin: input.strategy, discipline: input.discipline, catalogueReleaseId: input.catalogueReleaseId,
    ...(input.protocolReleaseId ? { protocolReleaseId: input.protocolReleaseId } : {}), tags: input.tags ?? [],
    ...(input.estimatedDurationSeconds !== undefined ? { estimatedDurationSeconds: input.estimatedDurationSeconds } : {}), blocks,
  };
}
