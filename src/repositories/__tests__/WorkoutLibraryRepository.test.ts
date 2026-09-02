import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workout } from '../../domain/types';

const state = vi.hoisted(() => ({
  cache: new Map<string, unknown>(),
  drafts: [] as unknown[],
  syncs: [] as unknown[],
}));

vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(state.cache.get(key))),
  set: vi.fn((key: string, value: unknown) => { state.cache.set(key, value); return Promise.resolve(); }),
}));
vi.mock('../../config/firebase', () => ({ db: {} }));
vi.mock('../DraftRepository', () => ({ draftRepository: { listWorkoutEnvelopes: vi.fn(() => Promise.resolve(state.drafts)) } }));
vi.mock('../SyncManager', () => ({ syncManager: { listSyncRecords: vi.fn(() => Promise.resolve(state.syncs)) } }));
vi.mock('../DeliveryAcknowledgementRepository', () => ({ deliveryAcknowledgementRepository: { listForOwner: vi.fn() } }));

import { WorkoutLibraryRepository } from '../WorkoutLibraryRepository';

const workout: Workout = { schemaVersion: 'humanv1.workout/1', workoutId: 'workout-1', title: 'Cloud workout',
  discipline: 'STRENGTH', catalogueReleaseId: 'release-1', tags: [], blocks: [] };
const publication = (overrides: Record<string, unknown> = {}) => ({ versionId: 'workout-1_r2_exact', globalId: 'workout-1',
  contentType: 'workout', schemaVersion: 'humanv1.workout/1', humanUserId: 'human-1', revision: 2,
  publicationState: 'PUBLISHED', sourceDraftId: 'workout-1', contentChecksum: 'b'.repeat(64), compatibleTags: [],
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', publishedAt: '2026-01-02T00:00:00Z',
  tombstoneState: 'ACTIVE', payload: workout, ...overrides });
const ack = (overrides: Record<string, unknown> = {}) => ({ acknowledgementId: 'strength-1', humanUserId: 'human-1',
  workoutGlobalId: 'workout-1', versionId: 'workout-1_r2_exact', applicationId: 'HUMAN_STRENGTH' as const,
  appliedChecksum: 'b'.repeat(64), sourceRevision: 2, state: 'APPLIED' as const, reasonCode: null, ...overrides });

describe('WorkoutLibraryRepository', () => {
  beforeEach(() => { state.cache.clear(); state.drafts = []; state.syncs = []; });

  it('reconstructs a published-only workout and requires an exact applied acknowledgement', async () => {
    const repository = new WorkoutLibraryRepository(async () => [publication({ revision: 1, versionId: 'workout-1_r1_old' }), publication()],
      async () => [ack({ versionId: 'workout-1_r1_old' }), ack({ appliedChecksum: 'c'.repeat(64) }), ack()], () => true);
    const result = await repository.list('human-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ globalId: 'workout-1', state: 'DOWNLOADED', draft: null });
    expect(result.items[0].versions.map(value => value.revision)).toEqual([2, 1]);
  });

  it('preserves unsent drafts, rejects cross-owner publications and does not duplicate merged content', async () => {
    state.drafts = [{ globalId: 'workout-1', humanUserId: 'human-1', revision: 3, status: 'DRAFT', payload: workout,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z', deletedAt: null, originClientId: 'local' }];
    const repository = new WorkoutLibraryRepository(async () => [publication(), publication({ humanUserId: 'human-2' })], async () => [], () => true);
    const result = await repository.list('human-1');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].draft).not.toBeNull();
    expect(result.items[0].versions).toHaveLength(1);
  });

  it('restores the last verified receipt offline and refreshes idempotently on reconnect', async () => {
    let online = true;
    const publications = vi.fn(async () => [publication()]);
    const repository = new WorkoutLibraryRepository(publications, async () => [ack()], () => online);
    expect((await repository.list('human-1')).items[0].state).toBe('DOWNLOADED');
    online = false;
    const offline = await repository.list('human-1');
    expect(offline.offline).toBe(true);
    expect(offline.items).toHaveLength(1);
    online = true;
    expect((await repository.list('human-1')).items).toHaveLength(1);
    expect(publications).toHaveBeenCalledTimes(2);
  });
});
