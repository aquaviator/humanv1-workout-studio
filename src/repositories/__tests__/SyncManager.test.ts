import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Plan, PlanDraftDependencyRecord, Workout } from '../../domain/types';
import { DraftEnvelope } from '../DraftRepository';
import { PublishedEnvelope } from '../../domain/publication';

const state = vi.hoisted(() => ({ values: new Map<string, unknown>(), remoteDocs: [] as Array<{ id: string; data: unknown }>, transactionFailure: null as Error | null, transactionCount: 0, uploaded: [] as string[], callableInputs: [] as unknown[], callableFailure: null as Error | null }));
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(state.values.get(key))),
  set: vi.fn((key: string, value: unknown) => { state.values.set(key, structuredClone(value)); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...state.values.keys()])), setMany: vi.fn((entries: Array<[string, unknown]>) => { for (const [key, value] of entries) state.values.set(key, structuredClone(value)); return Promise.resolve(); }),
  del: vi.fn((key: string) => { state.values.delete(key); return Promise.resolve(); }),
}));
vi.mock('../../config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => async (input: unknown) => {
  state.callableInputs.push(structuredClone(input)); if (state.callableFailure) throw state.callableFailure;
  return { data: { planId: 'plan-1', revision: 1, contentChecksum: 'a'.repeat(64), status: 'SAVED', idempotent: false, dependencyCount: 1, updatedAt: '2026-01-02T00:00:00.000Z' } };
}) }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ id: segments.at(-1) })), collection: vi.fn(), query: vi.fn(),
  getDocs: vi.fn(async () => ({ docs: state.remoteDocs.map(item => ({ id: item.id, data: () => structuredClone(item.data) })) })),
  runTransaction: vi.fn(async (_db, callback: (transaction: { get: () => Promise<{ exists: () => boolean }>; set: (ref: { id?: string }) => void }) => Promise<void>) => {
    state.transactionCount++;
    if (state.transactionFailure) throw state.transactionFailure;
    await callback({ get: async () => ({ exists: () => false }), set: (ref: { id?: string }) => { if (ref.id) state.uploaded.push(ref.id); } });
  }),
}));

import { SyncManager } from '../SyncManager';

const payload: Workout = { schemaVersion: 'humanv1.workout/1', workoutId: 'w1', title: 'Workout', discipline: 'STRENGTH', catalogueReleaseId: 'c1', tags: [], blocks: [] };
const envelope: PublishedEnvelope<Workout> = {
  versionId: 'w1_r1_checksum', globalId: 'w1', contentType: 'workout', schemaVersion: payload.schemaVersion,
  humanUserId: 'human-1', revision: 1, publicationState: 'PUBLISHED', sourceDraftId: 'w1', contentChecksum: 'a'.repeat(64),
  compatibleTags: ['STRENGTH'], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z', tombstoneState: 'ACTIVE', payload,
};

describe('SyncManager publication replay', () => {
  beforeEach(() => { state.values.clear(); state.remoteDocs.length = 0; state.transactionFailure = null; state.transactionCount = 0; state.uploaded.length = 0; state.callableInputs.length = 0; state.callableFailure = null; sessionStorage.clear(); window.history.replaceState({}, '', '/'); Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); });

  it('acknowledges an identical remote draft after an interrupted upload instead of inventing a conflict', async () => {
    const draft = { schemaVersion: 1, globalId: 'w1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, originClientId: 'web' };
    state.values.set('drafts_human-1_workout_w1', draft);
    state.values.set('sync_human-1_workout_w1', { envelope: draft, syncType: 'draft', status: 'SENDING', type: 'workout' });
    state.remoteDocs.push({ id: 'w1', data: draft });
    const manager = new SyncManager(); (manager as unknown as { isOnline: boolean }).isOnline = true;
    await manager.syncDown('human-1', ['workout']);
    const record = (await manager.listSyncRecords('human-1', 'workout'))[0];
    expect(record.status).toBe('SYNCED'); expect(record.acknowledgedRevision).toBe(1); expect(record.lastErrorCode).toBeUndefined();
  });

  it('does not create or replay queues or invoke the plan callable in read-only acceptance', async () => {
    window.history.replaceState({}, '', '/plans?acceptance=read-only');
    state.values.set('sync_human-1_plan_plan-1', { envelope: { ...envelope, globalId: 'plan-1' }, syncType: 'draft', status: 'QUEUED', type: 'plan', planSave: { planId: 'plan-1' } });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const manager = new SyncManager();
    (manager as unknown as { isOnline: boolean }).isOnline = true;
    await manager.syncPending();
    await expect(manager.queueUpload(envelope, 'workout', 'publication')).rejects.toThrow('READ_ONLY_ACCEPTANCE_MUTATION_BLOCKED');
    expect(state.callableInputs).toHaveLength(0);
    expect(state.transactionCount).toBe(0);
    expect((await manager.listSyncRecords('human-1', 'plan'))[0].status).toBe('QUEUED');
  });

  it('retires an acknowledged stale operation during read-only hydration without replaying it', async () => {
    window.history.replaceState({}, '', '/plans/plan-1?acceptance=read-only');
    const draft = { schemaVersion: 1, globalId: 'w1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, originClientId: 'web' };
    state.values.set('drafts_human-1_workout_w1', draft);
    state.values.set('sync_human-1_workout_w1', { envelope: draft, syncType: 'draft', status: 'SENDING', type: 'workout', attemptCount: 1 });
    state.remoteDocs.push({ id: 'w1', data: draft });
    const manager = new SyncManager(); (manager as unknown as { isOnline: boolean }).isOnline = true;
    await manager.syncDown('human-1', ['workout']);
    const result = (await manager.listSyncRecords('human-1', 'workout'))[0];
    expect(result.status).toBe('SYNCED'); expect(result.acknowledgedRevision).toBe(1);
    expect(state.transactionCount).toBe(0); expect(state.callableInputs).toHaveLength(0);
  });

  it('preserves one divergent dirty local record as a conflict when remote is newer', async () => {
    const local = { schemaVersion: 1, globalId: 'w1', humanUserId: 'human-1', revision: 2, status: 'DRAFT', payload: { ...payload, title: 'Local edit' },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', deletedAt: null, originClientId: 'web' };
    const remote = { ...local, revision: 3, payload: { ...payload, title: 'Remote edit' }, updatedAt: '2026-01-03T00:00:00.000Z' };
    state.values.set('drafts_human-1_workout_w1', local);
    state.values.set('sync_human-1_workout_w1', { envelope: local, syncType: 'draft', status: 'QUEUED', type: 'workout' });
    state.remoteDocs.push({ id: 'w1', data: remote });
    const manager = new SyncManager(); (manager as unknown as { isOnline: boolean }).isOnline = true;
    await manager.syncDown('human-1', ['workout']);
    expect((state.values.get('drafts_human-1_workout_w1') as typeof local).payload.title).toBe('Local edit');
    const result = (await manager.listSyncRecords('human-1', 'workout'))[0];
    expect(result.status).toBe('NEEDS_USER_REVIEW'); expect(result.lastErrorCode).toBe('REMOTE_CHANGED_WHILE_LOCAL_PENDING');
    expect(state.transactionCount).toBe(0);
  });

  it('durably queues offline and a reconstructed manager sees the queue', async () => {
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    expect((await manager.listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('QUEUED');
    expect((await new SyncManager().listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('QUEUED');
  });

  it('replays a durable SENDING record after the originating tab is interrupted', async () => {
    state.values.set(`sync_pub_human-1_workout_${envelope.versionId}`, { envelope, syncType: 'publication', status: 'SENDING', type: 'workout' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const reconstructed = new SyncManager(); (reconstructed as unknown as { isOnline: boolean }).isOnline = true;
    await reconstructed.syncPending();
    expect(state.transactionCount).toBe(1);
    expect((await reconstructed.listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('SYNCED');
  });

  it('automatically replays on reconnect and requires transaction acknowledgement', async () => {
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    await vi.waitFor(async () => expect((await manager.listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('SYNCED'));
    expect((await manager.listPublicationSyncRecords('human-1', 'workout'))[0].acknowledgedRevision).toBe(1);
  });

  it('maps permission denial to a typed conflict without losing content', async () => {
    const failure = new Error('Missing or insufficient permissions') as Error & { code: string };
    failure.code = 'permission-denied'; state.transactionFailure = failure;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    await manager.syncPending();
    const record = (await manager.listPublicationSyncRecords('human-1', 'workout'))[0];
    expect(record.status).toBe('NEEDS_USER_REVIEW');
    expect(record.lastErrorCode).toBe('PERMISSION_DENIED');
    expect(record.envelope).toEqual(envelope);
    expect(record.auditHistory?.at(-1)?.reason).toBe('PERMISSION_DENIED');
    const attempts = state.transactionCount;
    await manager.syncPending();
    expect(state.transactionCount).toBe(attempts);
  });

  it('stops an unknown deterministic failure after three attempts without losing its payload', async () => {
    state.transactionFailure = new Error('deterministic invalid content');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    await manager.syncPending(); await manager.syncPending();
    const record = (await manager.listPublicationSyncRecords('human-1', 'workout'))[0];
    expect(record.status).toBe('NEEDS_USER_REVIEW');
    expect(record.attemptCount).toBe(3);
    expect(record.envelope).toEqual(envelope);
    expect(record.auditHistory).toHaveLength(3);
    await manager.syncPending();
    expect(state.transactionCount).toBe(3);
  });

  it('coalesces concurrent replay requests so one immutable version is written once', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    (manager as unknown as { isOnline: boolean }).isOnline = true;
    await Promise.all([manager.syncPending(), manager.syncPending(), manager.syncPending()]);
    expect(state.transactionCount).toBe(1);
    expect((await manager.listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('SYNCED');
  });

  it('replays immutable workout dependencies before a plan regardless of key insertion order', async () => {
    const planEnvelope = { ...envelope, versionId: 'plan_r1_checksum', globalId: 'plan', contentType: 'plan' as const,
      schemaVersion: 'humanv1.plan/1', payload: { schemaVersion: 'humanv1.plan/1', planId: 'plan', title: 'Plan', weeks: [], workoutVersionIds: [envelope.versionId] } };
    state.values.set(`sync_pub_human-1_plan_${planEnvelope.versionId}`, { envelope: planEnvelope, syncType: 'publication', status: 'QUEUED', type: 'plan' });
    state.values.set(`sync_pub_human-1_workout_${envelope.versionId}`, { envelope, syncType: 'publication', status: 'QUEUED', type: 'workout' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const manager = new SyncManager();
    await manager.syncPending();
    expect(state.uploaded).toEqual([envelope.versionId, planEnvelope.versionId]);
  });

  it('durably queues one complete plan-save envelope and reconnects through the callable exactly once', async () => {
    const plan: Plan = { schemaVersion: 'humanv1.studio-plan-draft/1', planId: 'plan-1', title: 'Plan', description: '', weeks: [{ weekId: 'week-1', weekNumber: 1,
      label: 'Week 1', placements: [{ placementId: 'placement-1', dayOfWeek: 1, workoutId: 'workout-1', preferredMinuteOfDay: null, reminderEnabled: false, notes: '',
        dependency: { kind: 'WORKOUT_DRAFT', workoutDraftId: 'workout-1', humanUserId: 'human-1', expectedRevision: 1, displayName: 'Workout', originApplication: 'WORKOUT_STUDIO' } }] }] };
    const draft: DraftEnvelope<Plan> = { schemaVersion: 1, globalId: 'plan-1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload: plan,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, originClientId: 'web-local' };
    const dependency: PlanDraftDependencyRecord = { schemaVersion: 'humanv1.studio-plan-draft-dependency/1', dependencyId: 'plan-1__placement-1', humanUserId: 'human-1',
      planId: 'plan-1', placementId: 'placement-1', dependencyKind: 'WORKOUT_DRAFT', referencedStableId: 'workout-1', expectedRevision: 1, expectedUpdatedAt: draft.updatedAt,
      immutableVersionId: null, immutableRevision: null, immutableChecksum: null, immutableSchemaVersion: null, displayName: 'Workout', provenance: 'WORKOUT_STUDIO', revision: 1,
      createdAt: draft.createdAt, updatedAt: draft.updatedAt, deletedAt: null };
    const first = new SyncManager(); await first.queuePlanSave(draft, [dependency]);
    const queued = (await new SyncManager().listSyncRecords('human-1', 'plan'))[0];
    expect(queued.planSave?.dependencies).toHaveLength(1); expect(queued.planSave).not.toHaveProperty('humanUserId');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const replay = new SyncManager(); (replay as unknown as { isOnline: boolean }).isOnline = true; await replay.syncPending(); await replay.syncPending();
    expect(state.callableInputs).toHaveLength(1); expect(state.transactionCount).toBe(0);
    expect((await replay.listSyncRecords('human-1', 'plan'))[0].status).toBe('SYNCED');
  });

  it('keeps transient callable failures retryable and stops deterministic failures without losing the plan payload', async () => {
    const record = { envelope: { schemaVersion: 1, globalId: 'plan-1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload: { planId: 'plan-1' }, createdAt: '', updatedAt: '', deletedAt: null, originClientId: 'web' },
      syncType: 'draft', status: 'QUEUED', type: 'plan', planSave: { planId: 'plan-1' } };
    state.values.set('sync_human-1_plan_plan-1', record); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const manager = new SyncManager(); (manager as unknown as { isOnline: boolean }).isOnline = true;
    state.callableFailure = Object.assign(new Error('offline'), { code: 'functions/unavailable' }); await manager.syncPending();
    expect((await manager.listSyncRecords('human-1', 'plan'))[0].status).toBe('FAILED');
    state.callableFailure = Object.assign(new Error('Workout changed'), { code: 'functions/failed-precondition' }); await manager.syncPending();
    const failed = (await manager.listSyncRecords('human-1', 'plan'))[0]; expect(failed.status).toBe('NEEDS_USER_REVIEW'); expect(failed.envelope).toEqual(record.envelope);
  });

  it('preserves a callable validation reason instead of misreporting it as a revision conflict', async () => {
    const record = { envelope: { schemaVersion: 1, globalId: 'plan-1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload: { planId: 'plan-1' }, createdAt: '', updatedAt: '', deletedAt: null, originClientId: 'web' },
      syncType: 'draft', status: 'QUEUED', type: 'plan', planSave: { planId: 'plan-1' } };
    state.values.set('sync_human-1_plan_plan-1', record); Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    state.callableFailure = Object.assign(new Error('Workout changed'), { code: 'functions/failed-precondition', details: {
      reason: 'WORKOUT_REVISION_STALE', placementId: 'placement-1', displayName: 'Workout', explanation: 'Workout changed.',
      correctiveAction: 'Review the workout.', contentPreserved: true,
    } });
    const manager = new SyncManager(); (manager as unknown as { isOnline: boolean }).isOnline = true; await manager.syncPending();
    const failed = (await manager.listSyncRecords('human-1', 'plan'))[0];
    expect(failed.lastErrorCode).toBe('CONTENT_REJECTED'); expect(failed.attention).toMatchObject({ technicalCode: 'WORKOUT_REVISION_STALE', contentPreserved: true });
  });

  it('preserves a rejected create precondition when corrected content is queued', async () => {
    const plan = { schemaVersion: 'humanv1.studio-plan-draft/1', planId: 'plan-1', title: 'Plan', description: '', weeks: [{ weekId: 'week-1', weekNumber: 1, label: 'Week 1', placements: [] }] } as Plan;
    const first = { schemaVersion: 1, globalId: 'plan-1', humanUserId: 'human-1', revision: 1, status: 'DRAFT', payload: plan,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, originClientId: 'web' } as DraftEnvelope<Plan>;
    const manager = new SyncManager(); await manager.queuePlanSave(first, []);
    const failed = state.values.get('sync_human-1_plan_plan-1') as any; failed.status = 'NEEDS_USER_REVIEW'; state.values.set('sync_human-1_plan_plan-1', failed);
    await manager.queuePlanSave({ ...first, revision: 2, updatedAt: '2026-01-01T00:00:01.000Z' }, []);
    const corrected = (await manager.listSyncRecords('human-1', 'plan'))[0];
    expect(corrected.planSave).toMatchObject({ create: true, expectedRevision: null });
  });
});
