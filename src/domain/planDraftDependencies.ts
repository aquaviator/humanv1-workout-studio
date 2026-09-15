import type { DraftEnvelope } from "../repositories/DraftRepository";
import type { Plan, PlanDraftDependency, PlanPlacement, Workout } from "./types";
import { validateWorkoutForPublication } from "./validation/workoutValidation";

export const STUDIO_PLAN_DRAFT_SCHEMA = "humanv1.studio-plan-draft/1" as const;
export type LegacyDependencyClassification = "WORKOUT_DRAFT" | "PUBLISHED_WORKOUT_VERSION" | "GOVERNED_TEMPLATE" | "NEEDS_REVIEW";
export interface DependencyIssue { placementId: string; workoutId: string; displayName: string; state: "MISSING" | "ARCHIVED" | "INVALID" | "CROSS_OWNER" | "CHANGED" | "NEEDS_REVIEW"; message: string }

export function workoutDraftDependency(envelope: DraftEnvelope<Workout>): Extract<PlanDraftDependency, { kind: "WORKOUT_DRAFT" }> {
  return { kind: "WORKOUT_DRAFT", workoutDraftId: envelope.globalId, humanUserId: envelope.humanUserId, expectedRevision: envelope.revision,
    expectedUpdatedAt: envelope.updatedAt, displayName: envelope.payload.title, originApplication: "WORKOUT_STUDIO" };
}

export function classifyLegacyDependency(placement: PlanPlacement, publishedVersionIds: ReadonlySet<string> = new Set()): LegacyDependencyClassification {
  if (placement.dependency) return placement.dependency.kind;
  const value = placement.workoutVersionId ?? "";
  if (value.startsWith("research:")) return "GOVERNED_TEMPLATE";
  if (publishedVersionIds.has(value)) return "PUBLISHED_WORKOUT_VERSION";
  if (value === `${placement.workoutId}_v1` || value === `editable:${placement.workoutId}` || !value) return placement.workoutId ? "WORKOUT_DRAFT" : "NEEDS_REVIEW";
  return "NEEDS_REVIEW";
}

export function migrateLegacyPlanDraft(plan: Plan, owner: string, drafts: ReadonlyMap<string, DraftEnvelope<Workout>>, publishedVersionIds: ReadonlySet<string> = new Set()): { plan: Plan; classifications: LegacyDependencyClassification[] } {
  const copy: Plan = structuredClone(plan); const classifications: LegacyDependencyClassification[] = [];
  for (const week of copy.weeks) for (const placement of week.placements) {
    const classification = classifyLegacyDependency(placement, publishedVersionIds); classifications.push(classification);
    if (placement.dependency) continue;
    if (classification === "WORKOUT_DRAFT") { const draft = drafts.get(placement.workoutId); if (draft) placement.dependency = workoutDraftDependency(draft); }
    else if (classification === "GOVERNED_TEMPLATE") placement.dependency = { kind: "GOVERNED_TEMPLATE", templateId: placement.workoutId, immutableVersionId: placement.workoutVersionId!, displayName: placement.workoutId, provenance: "RESEARCH_CANDIDATE" };
    else if (classification === "PUBLISHED_WORKOUT_VERSION") placement.dependency = { kind: "PUBLISHED_WORKOUT_VERSION", workoutGlobalId: placement.workoutId, versionId: placement.workoutVersionId!, revision: 1, checksum: "", schemaVersion: "humanv1.canonical-workout/1", displayName: placement.workoutId };
  }
  copy.schemaVersion = STUDIO_PLAN_DRAFT_SCHEMA; copy.dependencyOwnerHumanUserId = owner;
  copy.dependencyKinds = [...new Set(copy.weeks.flatMap(week => week.placements.flatMap(item => item.dependency ? [item.dependency.kind] : [])))].sort();
  return { plan: copy, classifications };
}

export function validateDraftDependencies(plan: Plan, owner: string, drafts: ReadonlyMap<string, DraftEnvelope<Workout>>): DependencyIssue[] {
  const issues: DependencyIssue[] = [];
  for (const week of plan.weeks) for (const placement of week.placements) {
    const dependency = placement.dependency;
    const base = { placementId: placement.placementId, workoutId: placement.workoutId, displayName: dependency?.displayName ?? placement.workoutId };
    if (!dependency) { issues.push({ ...base, state: "NEEDS_REVIEW", message: `${base.displayName} needs a dependency choice.` }); continue; }
    if (dependency.kind === "WORKOUT_DRAFT") {
      if (dependency.humanUserId !== owner) { issues.push({ ...base, state: "CROSS_OWNER", message: `${base.displayName} belongs to another account.` }); continue; }
      const draft = drafts.get(dependency.workoutDraftId);
      if (!draft) { issues.push({ ...base, state: "MISSING", message: `${base.displayName} cannot be found. Select an available workout.` }); continue; }
      if (draft.humanUserId !== owner) { issues.push({ ...base, state: "CROSS_OWNER", message: `${base.displayName} belongs to another account.` }); continue; }
      if (draft.deletedAt) { issues.push({ ...base, state: "ARCHIVED", message: `${base.displayName} is archived. Restore or replace it.` }); continue; }
      if (validateWorkoutForPublication(draft.payload, []).length) issues.push({ ...base, state: "INVALID", message: `${base.displayName} needs attention before this plan can be sent.` });
    } else if (dependency.kind === "PUBLISHED_WORKOUT_VERSION") {
      if (!dependency.versionId || !dependency.workoutGlobalId || !dependency.checksum || !/^[0-9a-f]{64}$/.test(dependency.checksum)) issues.push({ ...base, state: "INVALID", message: `${base.displayName} has an invalid fixed version.` });
    } else if (!dependency.templateId || !dependency.immutableVersionId) issues.push({ ...base, state: "INVALID", message: `${base.displayName} has an invalid governed template reference.` });
  }
  return issues;
}

export function dependencyHasUnpublishedChanges(dependency: PlanDraftDependency | undefined, drafts: ReadonlyMap<string, DraftEnvelope<Workout>>): boolean {
  return dependency?.kind === "WORKOUT_DRAFT" && (drafts.get(dependency.workoutDraftId)?.revision ?? dependency.expectedRevision) !== dependency.expectedRevision;
}
