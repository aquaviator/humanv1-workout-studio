import { Plan, Workout } from "./types";
import { validatePlan } from "./validation/planValidation";
import { validateWorkoutForPublication } from "./validation/workoutValidation";
import type { ValidationError } from "./validation/workoutValidation";

export type PublicationEntityType = "plan" | "workout" | "protocol";
export type RetryEligibility = "RETRYABLE" | "NOT_RETRYABLE";

export interface PublicationDiagnostic {
  errorCode: string;
  entityType: PublicationEntityType;
  entityId: string;
  displayName: string;
  fieldPath: string;
  validationRule: string;
  explanation: string;
  userCorrectableInStudio: boolean;
  sourceMigrationRequired: boolean;
  retryEligibility: RetryEligibility;
}

export class PublicationDiagnosticError extends Error {
  public readonly diagnostic: PublicationDiagnostic;
  public readonly diagnostics: PublicationDiagnostic[];
  constructor(value: PublicationDiagnostic | PublicationDiagnostic[]) {
    const diagnostics = Array.isArray(value) ? value : [value];
    super(diagnostics[0]?.errorCode ?? "INVALID_CONTENT");
    this.name = "PublicationDiagnosticError";
    this.diagnostics = diagnostics;
    this.diagnostic = diagnostics[0];
  }
}

function workoutExplanation(workout: Workout, rule: string, blockId?: string): string {
  if (rule === "WORKOUT_REQUIRES_EXECUTABLE_BLOCK") return `${workout.title} cannot be sent because it has no executable exercise blocks.`;
  if (rule === "EXERCISE_REFERENCE_REQUIRED") return `${workout.title} cannot be sent because block ${blockId ?? "unknown"} has no executable exercise reference.`;
  if (rule === "SET_CONTENT_REQUIRED") return `${workout.title} cannot be sent because block ${blockId ?? "unknown"} has no executable set content.`;
  return `${workout.title} cannot be sent because its workout content is invalid.`;
}

export function diagnosticForWorkoutValidation(workout: Workout, error: ValidationError, editable: boolean): PublicationDiagnostic {
  return {
    errorCode: "INVALID_CONTENT", entityType: "workout", entityId: workout.workoutId, displayName: workout.title || "Untitled workout",
    fieldPath: error.fieldPath ?? (error.blockId ? `blocks[${error.blockId}]` : "workout"), validationRule: error.rule ?? "WORKOUT_CONTENT_INVALID",
    explanation: `${workoutExplanation(workout, error.rule ?? "WORKOUT_CONTENT_INVALID", error.blockId)} ${editable ? "Review the workout in Studio before sending again." : "Repair or migrate the source workout in Human Strength, then sync it again."}`,
    userCorrectableInStudio: editable, sourceMigrationRequired: !editable, retryEligibility: "NOT_RETRYABLE",
  };
}

export function validatePlanPublicationDependencies(plan: Plan, workouts: readonly Workout[], editableWorkoutIds: ReadonlySet<string> = new Set(workouts.map(item => item.workoutId))): PublicationDiagnostic[] {
  const diagnostics: PublicationDiagnostic[] = [];
  const planError = validatePlan(plan)[0];
  if (planError) diagnostics.push({
    errorCode: "INVALID_CONTENT", entityType: "plan", entityId: plan.planId, displayName: plan.title || "Untitled plan",
    fieldPath: planError.placementId ? `placements[${planError.placementId}]` : "plan", validationRule: "PLAN_CONTENT_INVALID",
    explanation: planError.message, userCorrectableInStudio: true, sourceMigrationRequired: false, retryEligibility: "NOT_RETRYABLE",
  });

  const byId = new Map(workouts.map(workout => [workout.workoutId, workout]));
  const uniqueIds = [...new Set(plan.weeks.flatMap(week => week.placements.map(placement => placement.workoutId)))];
  for (const workoutId of uniqueIds) {
    const workout = byId.get(workoutId);
    if (!workout) {
      diagnostics.push({ errorCode: "INVALID_CONTENT", entityType: "workout", entityId: workoutId, displayName: "Referenced workout",
        fieldPath: "placement.workoutId", validationRule: "WORKOUT_REFERENCE_RESOLVES", explanation: "A referenced workout cannot be found. Review the plan and select an available workout.",
        userCorrectableInStudio: true, sourceMigrationRequired: false, retryEligibility: "NOT_RETRYABLE" });
      continue;
    }
    const editable = editableWorkoutIds.has(workoutId);
    for (const error of validateWorkoutForPublication(workout, [])) diagnostics.push(diagnosticForWorkoutValidation(workout, error, editable));
  }
  return diagnostics;
}

export function transientPublicationDiagnostic(plan: Plan, error: unknown): PublicationDiagnostic {
  const code = error instanceof Error && error.message ? error.message : "PUBLICATION_FAILED";
  return { errorCode: code, entityType: "plan", entityId: plan.planId, displayName: plan.title || "Untitled plan", fieldPath: "delivery",
    validationRule: "TRANSIENT_DELIVERY_FAILURE", explanation: "Delivery did not complete. Check connectivity and try again.", userCorrectableInStudio: false,
    sourceMigrationRequired: false, retryEligibility: "RETRYABLE" };
}
