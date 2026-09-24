import { describe, expect, it } from 'vitest';
import type { DraftEnvelope } from '../../repositories/DraftRepository';
import type { Plan, PlanPlacement, Workout } from '../types';
import { classifyLegacyDependency, classifyLegacyPlan, dependencyHasUnpublishedChanges, migrateLegacyPlanDraft, reconcileAuthoritativePlanDependencies, STUDIO_PLAN_DRAFT_SCHEMA, validateDraftDependencies, workoutDraftDependency } from '../planDraftDependencies';

const workout = (id = 'workout-a'): Workout => ({ schemaVersion: 'humanv1.workout/1', workoutId: id, title: 'Strength A', discipline: 'STRENGTH', catalogueReleaseId: 'catalogue-1', tags: [], blocks: [{ blockId: `${id}-block`, type: 'EXERCISE', exerciseId: 'squat', exerciseNameSnapshot: 'Squat', efforts: [{ effortId: `${id}-set`, effortType: 'WORKING', prescriptions: [{ prescriptionId: `${id}-rx`, metricKey: 'repetitions', targetValue: 8 }] }] }] });
const envelope = (overrides: Partial<DraftEnvelope<Workout>> = {}): DraftEnvelope<Workout> => ({ schemaVersion: 1, globalId: 'workout-a', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload: workout(), createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', deletedAt: null, originClientId: 'web_local_client', ...overrides });
const placement = (value: Partial<PlanPlacement> = {}): PlanPlacement => ({ placementId: 'placement-1', dayOfWeek: 2, workoutId: 'workout-a', preferredMinuteOfDay: null, reminderEnabled: false, notes: '', ...value });
const plan = (p = placement()): Plan => ({ schemaVersion: STUDIO_PLAN_DRAFT_SCHEMA, planId: 'plan-1', title: 'Base', description: '', dependencyOwnerHumanUserId: 'human-1', dependencyKinds: ['WORKOUT_DRAFT'], weeks: [{ weekId: 'week-1', weekNumber: 1, label: 'Week 1', placements: [p] }] });

describe('Studio plan draft dependencies', () => {
  it('creates an owner-bound revision-pinned workout draft reference', () => expect(workoutDraftDependency(envelope())).toMatchObject({ kind: 'WORKOUT_DRAFT', workoutDraftId: 'workout-a', humanUserId: 'human-1', expectedRevision: 1 }));
  it('saves and reloads eight unpublished dependencies without immutable IDs', () => { const drafts = new Map(Array.from({ length: 8 }, (_, i) => { const item = envelope({ globalId: `w-${i}`, payload: workout(`w-${i}`) }); return [item.globalId, item] as const; })); const source: Plan = { ...plan(), weeks: [{ ...plan().weeks[0], placements: [...drafts.values()].map((item, i) => placement({ placementId: `p-${i}`, workoutId: item.globalId, dependency: workoutDraftDependency(item) })) }] }; const reloaded = structuredClone(source); expect(validateDraftDependencies(reloaded, 'human-1', drafts)).toEqual([]); expect(JSON.stringify(reloaded)).not.toContain('publishedWorkouts'); });
  it('keeps a placement and marks a later workout revision as unpublished changes', () => { const original = envelope(); const dependency = workoutDraftDependency(original); const edited = envelope({ revision: 2, updatedAt: '2026-01-02T00:00:00Z' }); expect(dependencyHasUnpublishedChanges(dependency, new Map([['workout-a', edited]]))).toBe(true); expect(plan({ ...placement(), dependency }).weeks[0].placements[0].placementId).toBe('placement-1'); });
  it('detects missing, archived, invalid and cross-owner drafts', () => { const dependency = workoutDraftDependency(envelope()); expect(validateDraftDependencies(plan({ ...placement(), dependency }), 'human-1', new Map())[0].state).toBe('MISSING'); expect(validateDraftDependencies(plan({ ...placement(), dependency }), 'human-1', new Map([['workout-a', envelope({ deletedAt: '2026-01-02' })]]))[0].state).toBe('ARCHIVED'); expect(validateDraftDependencies(plan({ ...placement(), dependency }), 'human-1', new Map([['workout-a', envelope({ payload: { ...workout(), blocks: [] } })]]))[0].state).toBe('INVALID'); const crossOwner = { ...dependency, humanUserId: 'human-2' } as Extract<typeof dependency, { kind: 'WORKOUT_DRAFT' }>; expect(validateDraftDependencies(plan({ ...placement(), dependency: crossOwner }), 'human-1', new Map([['workout-a', envelope()] ]))[0].state).toBe('CROSS_OWNER'); });
  it('allows safe removal or replacement without changing placement identity', () => { const original = plan({ ...placement(), dependency: workoutDraftDependency(envelope()) }); const replacement = envelope({ globalId: 'workout-b', payload: workout('workout-b') }); original.weeks[0].placements[0] = { ...original.weeks[0].placements[0], workoutId: 'workout-b', dependency: workoutDraftDependency(replacement) }; expect(original.weeks[0].placements[0]).toMatchObject({ placementId: 'placement-1', workoutId: 'workout-b' }); });
  it('classifies legacy draft, immutable, governed and ambiguous references deterministically', () => { expect(classifyLegacyDependency(placement({ workoutVersionId: 'workout-a_v1' }))).toBe('WORKOUT_DRAFT'); expect(classifyLegacyDependency(placement({ workoutVersionId: 'fixed-v1' }), new Set(['fixed-v1']))).toBe('PUBLISHED_WORKOUT_VERSION'); expect(classifyLegacyDependency(placement({ workoutVersionId: 'research:run:1' }))).toBe('GOVERNED_TEMPLATE'); expect(classifyLegacyDependency(placement({ workoutVersionId: 'unknown-version' }))).toBe('NEEDS_REVIEW'); });
  it('migrates unambiguous legacy draft references idempotently without publication', () => { const drafts = new Map([['workout-a', envelope()]]); const first = migrateLegacyPlanDraft({ ...plan(), schemaVersion: '1', dependencyKinds: undefined, dependencyOwnerHumanUserId: undefined, weeks: [{ ...plan().weeks[0], placements: [placement({ workoutVersionId: 'workout-a_v1' })] }] }, 'human-1', drafts); const second = migrateLegacyPlanDraft(first.plan, 'human-1', drafts); expect(second.plan).toEqual(first.plan); expect(first.classifications).toEqual(['WORKOUT_DRAFT']); expect(first.plan.schemaVersion).toBe(STUDIO_PLAN_DRAFT_SCHEMA); });
  it('requires complete immutable metadata for published dependencies', () => { const p = placement({ dependency: { kind: 'PUBLISHED_WORKOUT_VERSION', workoutGlobalId: 'w', versionId: 'v', revision: 1, checksum: '', schemaVersion: 'humanv1.canonical-workout/1', displayName: 'Fixed' } }); expect(validateDraftDependencies(plan(p), 'human-1', new Map())[0].state).toBe('INVALID'); });
  it('classifies stored legacy plan states without mutating them', () => {
    const planEnvelope: DraftEnvelope<Plan> = { ...envelope(), globalId: 'plan-1', payload: plan() };
    const record = { schemaVersion: 'humanv1.studio-plan-draft-dependency/1' as const, dependencyId: 'plan-1__placement-1', humanUserId: 'human-1', planId: 'plan-1', placementId: 'placement-1',
      dependencyKind: 'WORKOUT_DRAFT' as const, referencedStableId: 'workout-a', expectedRevision: 1, expectedUpdatedAt: null, immutableVersionId: null, immutableRevision: null,
      immutableChecksum: null, immutableSchemaVersion: null, displayName: 'Workout', provenance: 'WORKOUT_STUDIO', revision: 1, createdAt: planEnvelope.createdAt,
      updatedAt: planEnvelope.updatedAt, deletedAt: null };
    expect(classifyLegacyPlan(planEnvelope, [record])).toBe('COMPLETE_AND_COMPATIBLE');
    expect(classifyLegacyPlan(planEnvelope, [])).toBe('MISSING_NORMALIZED_DEPENDENCIES');
    expect(classifyLegacyPlan(planEnvelope, [{ ...record, revision: 2 }])).toBe('STALE_DEPENDENCY_REVISION');
    expect(classifyLegacyPlan({ ...planEnvelope, deletedAt: '2026-01-02' }, [record])).toBe('ARCHIVED_LEGACY_PLAN');
  });
  it('reconstructs exactly one dependency from a complete authoritative manifest', () => {
    const source = plan({ ...placement(), dependency: undefined });
    const record = { schemaVersion: 'humanv1.studio-plan-draft-dependency/1' as const, dependencyId: 'plan-1__placement-1', humanUserId: 'human-1', planId: 'plan-1', placementId: 'placement-1',
      dependencyKind: 'WORKOUT_DRAFT' as const, referencedStableId: 'workout-a', expectedRevision: 2, expectedUpdatedAt: '2026-01-02T00:00:00Z', immutableVersionId: null,
      immutableRevision: null, immutableChecksum: null, immutableSchemaVersion: null, displayName: 'Strength A', provenance: 'WORKOUT_STUDIO', revision: 3,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', deletedAt: null };
    const result = reconcileAuthoritativePlanDependencies(source, 'human-1', 3, [record]);
    expect(result.weeks[0].placements).toHaveLength(1);
    expect(result.weeks[0].placements[0].dependency).toMatchObject({ kind: 'WORKOUT_DRAFT', workoutDraftId: 'workout-a', expectedRevision: 2 });
    expect(result.dependencyCount).toBe(1);
  });
  it('fails closed for duplicate, cross-owner, stale or mismatched manifests', () => {
    const source = plan({ ...placement(), dependency: undefined });
    const record = { schemaVersion: 'humanv1.studio-plan-draft-dependency/1' as const, dependencyId: 'plan-1__placement-1', humanUserId: 'human-1', planId: 'plan-1', placementId: 'placement-1',
      dependencyKind: 'WORKOUT_DRAFT' as const, referencedStableId: 'workout-a', expectedRevision: 1, expectedUpdatedAt: null, immutableVersionId: null, immutableRevision: null,
      immutableChecksum: null, immutableSchemaVersion: null, displayName: 'Strength A', provenance: 'WORKOUT_STUDIO', revision: 3, createdAt: '', updatedAt: '', deletedAt: null };
    expect(reconcileAuthoritativePlanDependencies(source, 'human-1', 3, [record, record])).toEqual(source);
    expect(reconcileAuthoritativePlanDependencies(source, 'human-1', 3, [{ ...record, humanUserId: 'human-2' }])).toEqual(source);
    expect(reconcileAuthoritativePlanDependencies(source, 'human-1', 4, [record])).toEqual(source);
  });
  it('deduplicates repeated warnings for the same placement but preserves two legitimate placements', () => {
    const duplicated = { ...plan(), weeks: [{ ...plan().weeks[0], placements: [placement(), placement()] }] };
    expect(validateDraftDependencies(duplicated, 'human-1', new Map())).toHaveLength(1);
    const legitimate = { ...plan(), weeks: [{ ...plan().weeks[0], placements: [placement(), placement({ placementId: 'placement-2' })] }] };
    expect(validateDraftDependencies(legitimate, 'human-1', new Map())).toHaveLength(2);
  });
});
