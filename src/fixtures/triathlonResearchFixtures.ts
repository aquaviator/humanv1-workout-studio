import datasetJson from "./research/triathlon-research-dataset.json";
import { canonicalChecksum } from "../domain/canonical";
import type { Plan } from "../domain/types";

export interface ResearchAssignment { assignmentId: string; orderWithinDay: number; assignmentType: "SESSION" | "OPTIONAL_SESSION" | "RACE"; sessionId: string; required: boolean; priority: "REQUIRED" | "OPTIONAL" | "PRIORITY" }
export interface ResearchDay { dayOfWeek: string; order: number; dayType: "REST" | "TRAINING"; dayObjective: string; assignments: ResearchAssignment[] }
export interface ResearchWeek { weekNumber: number; phaseId: string; phaseName: string; recoveryWeek: boolean; swimMinutes: number; bikeMinutes: number; runMinutes: number; strengthMinutes: number; multisportMinutes: number; recoveryMinutes: number; requiredTotalMinutes: number; optionalMinutes: number; days: ResearchDay[] }
export interface ResearchPlan { planId: string; name: string; durationWeeks: number; prerequisites: unknown; phases: Array<{ phaseId: string; name: string; objective: string }>; weeks: ResearchWeek[]; evidenceReferenceIds: string[]; provenance: { fixtureClassification: "RESEARCH_CANDIDATE"; sportsScienceReviewRequired: true; medicalAdvice: false } }
interface ResearchDataset { status: "RESEARCH_CANDIDATE"; planScheduleSchemaVersion: "1.2"; disclaimer: string; sessions: Array<{ sessionId: string; name: string; variableDuration: boolean; totalDurationMinutes: number; discipline: string }>; plans: ResearchPlan[]; evidenceCatalogue: Array<{ evidenceId: string; title: string; directness: string; verificationStatus: string; limitations: string }>; manifest: { counts: Record<string, number>; checksums: { datasetSha256: string } } }

export const triathlonResearchDataset = datasetJson as unknown as ResearchDataset;
export const triathlonResearchPlans = triathlonResearchDataset.plans;

const dayNumber = (value: string) => ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"].indexOf(value) + 1;
export function cloneResearchPlanToDraft(source: ResearchPlan, humanUserId: string): Plan {
  const planId = `research_copy_${canonicalChecksum(`${humanUserId}|${source.planId}|${triathlonResearchDataset.manifest.checksums.datasetSha256}`).slice(0, 20)}`;
  return {
    schemaVersion: "humanv1.plan/1", planId, title: `${source.name} — Research Copy`,
    description: `${triathlonResearchDataset.disclaimer} Source: ${source.planId}.`, timezone: "Europe/London",
    workoutVersionIds: [...new Set(source.weeks.flatMap(week => week.days).flatMap(day => day.assignments).map(item => `research:${item.sessionId}:1.0.1`))].sort(),
    phases: source.phases.map((phase, index) => ({ phaseId: phase.phaseId, name: phase.name, objective: phase.objective, order: index + 1, weekNumbers: source.weeks.filter(week => week.phaseId === phase.phaseId).map(week => week.weekNumber), source: "CLONED_DRAFT" })),
    weeks: source.weeks.map(week => ({ weekId: `${planId}_week_${week.weekNumber}`, weekNumber: week.weekNumber, label: `${week.phaseName}${week.recoveryWeek ? " · Recovery" : ""}`, placements: week.days.flatMap(day => day.assignments.map(item => ({ placementId: item.assignmentId, dayOfWeek: dayNumber(day.dayOfWeek), workoutId: item.sessionId, workoutVersionId: `research:${item.sessionId}:1.0.1`, preferredMinuteOfDay: null, reminderEnabled: false, notes: `${item.orderWithinDay}. ${item.priority}${item.assignmentType === "RACE" ? " · variable-duration race placeholder" : ""}` }))) })),
    notes: "Cloned from an immutable RESEARCH_CANDIDATE fixture. No automatic publication. Sports-science review remains required.",
  };
}
