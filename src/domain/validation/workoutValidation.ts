import { Workout, Block, ExerciseBlock, CircuitBlock, SupersetBlock, RestBlock } from "../types";
import { Exercise } from "../catalogue";
import { blocksPublication } from "../presentation";

export interface ValidationError {
  blockId?: string;
  effortId?: string;
  fieldPath?: string;
  rule?: string;
  message: string;
}

export function validateWorkout(workout: Workout, catalogue: Exercise[]): ValidationError[] {
  const errors: ValidationError[] = [];
  if (blocksPublication(workout.reconstructionDiagnostics)) errors.push({ message: "Publication is unavailable because original workout details cannot be verified." });

  if (!workout.title || workout.title.trim() === "") {
    errors.push({ fieldPath: "title", rule: "WORKOUT_TITLE_REQUIRED", message: "Workout is missing a title." });
  }

  const blocks = Array.isArray(workout.blocks) ? workout.blocks : [];
  if (blocks.length === 0) {
    errors.push({ fieldPath: "blocks", rule: "WORKOUT_REQUIRES_EXECUTABLE_BLOCK", message: "Workout has no executable exercise blocks." });
  }

  const seenIds = new Set<string>();
  const checkId = (id: string, context: string) => {
    if (seenIds.has(id)) {
      errors.push({ blockId: id, message: `Duplicate stable ID found in ${context}.` });
    }
    seenIds.add(id);
  };

  blocks.forEach((block) => {
    checkId(block.blockId, block.type);

    if (block.type === "SUPERSET") {
      const exercises = Array.isArray(block.exercises) ? block.exercises : [];
      if (exercises.length === 0) {
        errors.push({ blockId: block.blockId, message: "Superset is empty." });
      } else if (exercises.length < 2) {
        errors.push({ blockId: block.blockId, message: "Superset must contain at least two exercises." });
      }
      exercises.forEach(ex => checkExerciseBlock(ex, block.blockId, errors, catalogue, checkId));
    } else if (block.type === "CIRCUIT") {
      const exercises = Array.isArray(block.exercises) ? block.exercises : [];
      if (exercises.length === 0) {
        errors.push({ blockId: block.blockId, message: "Circuit is empty." });
      } else if (exercises.length < 2) {
        errors.push({ blockId: block.blockId, message: "Circuit must contain at least two exercises." });
      }
      if (block.rounds <= 0) {
        errors.push({ blockId: block.blockId, message: "Circuit rounds must be greater than 0." });
      }
      exercises.forEach(ex => checkExerciseBlock(ex, block.blockId, errors, catalogue, checkId));
    } else if (block.type === "EXERCISE") {
      checkExerciseBlock(block, block.blockId, errors, catalogue, checkId);
    } else if (block.type === "REST") {
      if (block.durationSeconds < 0) {
        errors.push({ blockId: block.blockId, message: "Rest duration cannot be negative." });
      }
    }
  });

  return errors;
}

function checkExerciseBlock(
  block: ExerciseBlock,
  parentBlockId: string,
  errors: ValidationError[],
  catalogue: Exercise[],
  checkId: (id: string, ctx: string) => void
) {
  if (parentBlockId !== block.blockId) {
    checkId(block.blockId, "EXERCISE");
  }
  const exerciseDef = catalogue.find(e => e.exerciseId === block.exerciseId);
  const supportedMetrics = exerciseDef ? [...exerciseDef.metricProfile.primary, ...exerciseDef.metricProfile.secondary, ...exerciseDef.metricProfile.optional] : [];
  const unsupportedMetrics = exerciseDef ? exerciseDef.metricProfile.unsupported : [];

  const efforts = Array.isArray(block.efforts) ? block.efforts : [];
  efforts.forEach(effort => {
    checkId(effort.effortId, "EFFORT");
    const prescriptions = Array.isArray(effort.prescriptions) ? effort.prescriptions : [];
    prescriptions.forEach(p => {
      checkId(p.prescriptionId, "PRESCRIPTION");
      
      if (p.targetValue !== undefined && p.targetValue < 0) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Target value for ${p.metricKey} cannot be negative.` });
      }
      if (p.minimumValue !== undefined && p.minimumValue < 0) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Minimum value for ${p.metricKey} cannot be negative.` });
      }
      if (p.maximumValue !== undefined && p.maximumValue < 0) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Maximum value for ${p.metricKey} cannot be negative.` });
      }
      
      if (p.minimumValue !== undefined && p.targetValue !== undefined && p.minimumValue > p.targetValue) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Minimum value for ${p.metricKey} cannot be greater than target.` });
      }
      if (p.targetValue !== undefined && p.maximumValue !== undefined && p.targetValue > p.maximumValue) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Target value for ${p.metricKey} cannot be greater than maximum.` });
      }

      if (exerciseDef && unsupportedMetrics.includes(p.metricKey)) {
        errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Metric ${p.metricKey} is unsupported for exercise ${exerciseDef.name}.` });
      }

      if (p.targetValue === undefined && p.minimumValue === undefined && p.maximumValue === undefined && p.textValue === undefined) {
         errors.push({ blockId: parentBlockId, effortId: effort.effortId, message: `Missing target for ${p.metricKey}.` });
      }
    });
  });
}

/** Strict delivery contract; draft editing may temporarily contain incomplete rows. */
export function validateWorkoutForPublication(workout: Workout, catalogue: Exercise[]): ValidationError[] {
  const errors = validateWorkout(workout, catalogue);
  const blocks = Array.isArray(workout.blocks) ? workout.blocks : [];
  const exerciseBlocks = blocks.flatMap(block =>
    block.type === "EXERCISE" ? [{ block, parentId: block.blockId }] : block.type === "SUPERSET" || block.type === "CIRCUIT"
      ? (Array.isArray(block.exercises) ? block.exercises : []).map(child => ({ block: child, parentId: block.blockId })) : []
  );
  if (blocks.length > 0 && exerciseBlocks.length === 0) errors.push({ fieldPath: "blocks", rule: "WORKOUT_REQUIRES_EXECUTABLE_BLOCK", message: "Workout has no executable exercise blocks." });
  for (const { block, parentId } of exerciseBlocks) {
    if (!block.exerciseId?.trim()) errors.push({ blockId: parentId, fieldPath: `blocks[${parentId}].exerciseId`, rule: "EXERCISE_REFERENCE_REQUIRED", message: "Exercise block is missing an executable exercise reference." });
    const efforts = Array.isArray(block.efforts) ? block.efforts : [];
    if (efforts.length === 0) errors.push({ blockId: parentId, fieldPath: `blocks[${parentId}].efforts`, rule: "SET_CONTENT_REQUIRED", message: "Exercise block has no set content." });
    for (const effort of efforts) if (!Array.isArray(effort.prescriptions) || effort.prescriptions.length === 0) errors.push({ blockId: parentId, effortId: effort.effortId, fieldPath: `blocks[${parentId}].efforts[${effort.effortId}].prescriptions`, rule: "SET_CONTENT_REQUIRED", message: "Set has no executable prescription." });
  }
  return errors;
}
