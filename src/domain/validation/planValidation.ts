import { Plan } from "../types";

export interface PlanValidationError {
  placementId?: string;
  message: string;
}

export function validatePlan(plan: Plan): PlanValidationError[] {
  const errors: PlanValidationError[] = [];
  
  if (!plan.title || plan.title.trim() === "") {
    errors.push({ message: "Plan is missing a title." });
  }
  
  if (plan.weeks.length === 0) {
    errors.push({ message: "Plan must have at least one week." });
  }

  const seenPlacementIds = new Set<string>();

  plan.weeks.forEach(week => {
    week.placements.forEach(p => {
      if (seenPlacementIds.has(p.placementId)) {
        errors.push({ placementId: p.placementId, message: "Duplicate placement ID found." });
      }
      seenPlacementIds.add(p.placementId);
      
      if (!p.workoutId) {
        errors.push({ placementId: p.placementId, message: "Placement is missing a workout reference." });
      }
      if (!p.workoutVersionId) {
        errors.push({ placementId: p.placementId, message: "Placement is missing an immutable workout version reference." });
      }

      if (p.dayOfWeek < 1 || p.dayOfWeek > 7) {
        errors.push({ placementId: p.placementId, message: "Invalid day of week. Must be between 1 and 7." });
      }
    });
  });

  return errors;
}
