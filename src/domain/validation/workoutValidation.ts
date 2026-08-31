import { Workout, Block, ExerciseBlock, CircuitBlock, SupersetBlock, RestBlock } from "../types";
import { Exercise } from "../catalogue";

export interface ValidationError {
  blockId?: string;
  effortId?: string;
  message: string;
}

export function validateWorkout(workout: Workout, catalogue: Exercise[]): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!workout.title || workout.title.trim() === "") {
    errors.push({ message: "Workout is missing a title." });
  }

  if (workout.blocks.length === 0) {
    errors.push({ message: "Workout is empty. Add some exercises." });
  }

  const seenIds = new Set<string>();
  const checkId = (id: string, context: string) => {
    if (seenIds.has(id)) {
      errors.push({ blockId: id, message: `Duplicate stable ID found in ${context}.` });
    }
    seenIds.add(id);
  };

  workout.blocks.forEach((block) => {
    checkId(block.blockId, block.type);

    if (block.type === "SUPERSET") {
      if (block.exercises.length === 0) {
        errors.push({ blockId: block.blockId, message: "Superset is empty." });
      } else if (block.exercises.length < 2) {
        errors.push({ blockId: block.blockId, message: "Superset must contain at least two exercises." });
      }
      block.exercises.forEach(ex => checkExerciseBlock(ex, block.blockId, errors, catalogue, checkId));
    } else if (block.type === "CIRCUIT") {
      if (block.exercises.length === 0) {
        errors.push({ blockId: block.blockId, message: "Circuit is empty." });
      } else if (block.exercises.length < 2) {
        errors.push({ blockId: block.blockId, message: "Circuit must contain at least two exercises." });
      }
      if (block.rounds <= 0) {
        errors.push({ blockId: block.blockId, message: "Circuit rounds must be greater than 0." });
      }
      block.exercises.forEach(ex => checkExerciseBlock(ex, block.blockId, errors, catalogue, checkId));
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
  checkId(block.blockId, "EXERCISE");
  const exerciseDef = catalogue.find(e => e.exerciseId === block.exerciseId);
  const supportedMetrics = exerciseDef ? [...exerciseDef.metricProfile.primary, ...exerciseDef.metricProfile.secondary, ...exerciseDef.metricProfile.optional] : [];
  const unsupportedMetrics = exerciseDef ? exerciseDef.metricProfile.unsupported : [];

  block.efforts.forEach(effort => {
    checkId(effort.effortId, "EFFORT");
    effort.prescriptions.forEach(p => {
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
