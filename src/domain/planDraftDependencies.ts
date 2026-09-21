import type { DraftEnvelope } from "../repositories/DraftRepository";
import type { Plan, PlanDraftDependency, PlanDraftDependencyRecord, PlanPlacement, Workout } from "./types";
import { validateWorkoutForPublication } from "./validation/workoutValidation";

export const STUDIO_PLAN_DRAFT_SCHEMA = "humanv1.studio-plan-draft/1" as const;
export const STUDIO_PLAN_DRAFT_DEPENDENCY_SCHEMA = "humanv1.studio-plan-draft-dependency/1" as const;

export const planDependencyId = (planId: string, placementId: string) => `${planId}__${placementId}`;

export function normalizePlanDependencyRecords(plan: Plan, owner: string, revision: number, createdAt: string, updatedAt: string): PlanDraftDependencyRecord[] {
  const records: PlanDraftDependencyRecord[] = [];
  for (const week of plan.weeks) for (const placement of week.placements) {
    const dependency = placement.dependency;
    if (!dependency) continue;
    const common = { schemaVersion: STUDIO_PLAN_DRAFT_DEPENDENCY_SCHEMA, dependencyId: planDependencyId(plan.planId, placement.placementId), humanUserId: owner,
      planId: plan.planId, placementId: placement.placementId, dependencyKind: dependency.kind, displayName: dependency.displayName,
      revision, createdAt, updatedAt, deletedAt: null } as const;
    if (dependency.kind === "WORKOUT_DRAFT") records.push({ ...common, referencedStableId: dependency.workoutDraftId, expectedRevision: dependency.expectedRevision,
      expectedUpdatedAt: dependency.expectedUpdatedAt ?? null, immutableVersionId: null, immutableRevision: null, immutableChecksum: null,
      immutableSchemaVersion: null, provenance: dependency.originApplication });
    else if (dependency.kind === "PUBLISHED_WORKOUT_VERSION") records.push({ ...common, referencedStableId: dependency.workoutGlobalId, expectedRevision: null,
      expectedUpdatedAt: null, immutableVersionId: dependency.versionId, immutableRevision: dependency.revision, immutableChecksum: dependency.checksum,
      immutableSchemaVersion: dependency.schemaVersion, provenance: "IMMUTABLE_PUBLICATION" });
    else records.push({ ...common, referencedStableId: dependency.templateId, expectedRevision: null, expectedUpdatedAt: null,
      immutableVersionId: dependency.immutableVersionId, immutableRevision: null, immutableChecksum: null, immutableSchemaVersion: null,
      provenance: dependency.provenance });
  }
  return records;
}
export type LegacyDependencyClassification = "WORKOUT_DRAFT" | "PUBLISHED_WORKOUT_VERSION" | "GOVERNED_TEMPLATE" | "NEEDS_REVIEW";
export type LegacyPlanClassification = "COMPLETE_AND_COMPATIBLE" | "MISSING_NORMALIZED_DEPENDENCIES" | "STALE_DEPENDENCY_REVISION" |
  "AMBIGUOUS_DEPENDENCY" | "ARCHIVED_LEGACY_PLAN" | "REQUIRES_REVIEW";
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
  copy.dependencyStorageVersion = 1;
  copy.dependencyCount = copy.weeks.reduce((count, week) => count + week.placements.filter(item => item.dependency).length, 0);
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

export function classifyLegacyPlan(envelope: DraftEnvelope<Plan>, records: readonly PlanDraftDependencyRecord[]): LegacyPlanClassification {
  if (envelope.deletedAt != null) return "ARCHIVED_LEGACY_PLAN";
  if (envelope.payload.schemaVersion !== STUDIO_PLAN_DRAFT_SCHEMA) return "REQUIRES_REVIEW";
  const placements = envelope.payload.weeks.flatMap(week => week.placements);
  const active = records.filter(record => record.deletedAt == null && record.planId === envelope.globalId);
  if (active.length < placements.length) return "MISSING_NORMALIZED_DEPENDENCIES";
  const byPlacement = new Map<string, PlanDraftDependencyRecord[]>();
  for (const record of active) byPlacement.set(record.placementId, [...(byPlacement.get(record.placementId) ?? []), record]);
  if (active.length !== placements.length || placements.some(item => (byPlacement.get(item.placementId)?.length ?? 0) !== 1)) return "AMBIGUOUS_DEPENDENCY";
  if (active.some(record => record.revision !== envelope.revision)) return "STALE_DEPENDENCY_REVISION";
  return "COMPLETE_AND_COMPATIBLE";
}
