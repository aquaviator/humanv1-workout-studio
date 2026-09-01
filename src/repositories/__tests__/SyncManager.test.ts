import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Workout } from '../../domain/types';
import { PublishedEnvelope } from '../../domain/publication';

const state = vi.hoisted(() => ({ values: new Map<string, unknown>(), transactionFailure: null as Error | null }));
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(state.values.get(key))),
  set: vi.fn((key: string, value: unknown) => { state.values.set(key, structuredClone(value)); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...state.values.keys()])), setMany: vi.fn(),
}));
vi.mock('../../config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), collection: vi.fn(), query: vi.fn(), getDocs: vi.fn(),
  runTransaction: vi.fn(async (_db, callback: (transaction: { get: () => Promise<{ exists: () => boolean }>; set: () => void }) => Promise<void>) => {
    if (state.transactionFailure) throw state.transactionFailure;
    await callback({ get: async () => ({ exists: () => false }), set: () => undefined });
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
  beforeEach(() => { state.values.clear(); state.transactionFailure = null; Object.defineProperty(navigator, 'onLine', { configurable: true, value: false }); });

  it('durably queues offline and a reconstructed manager sees the queue', async () => {
    const manager = new SyncManager();
    await manager.queueUpload(envelope, 'workout', 'publication');
    expect((await manager.listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('QUEUED');
    expect((await new SyncManager().listPublicationSyncRecords('human-1', 'workout'))[0].status).toBe('QUEUED');
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
    expect(record.status).toBe('CONFLICT');
    expect(record.lastErrorCode).toBe('PERMISSION_DENIED');
    expect(record.envelope).toEqual(envelope);
  });
});
