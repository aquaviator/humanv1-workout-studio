import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Protocol, Workout } from '../../domain/types';

const state = vi.hoisted(() => ({ values: new Map<string, unknown>(), queued: vi.fn() }));
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(state.values.get(key))),
  set: vi.fn((key: string, value: unknown) => { state.values.set(key, value); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...state.values.keys()])),
}));
vi.mock('../SyncManager', () => ({ syncManager: { queueUpload: state.queued } }));

import { PublicationRepository } from '../PublicationRepository';

const workout = (): Workout => ({
  schemaVersion: 'humanv1.workout/1', workoutId: 'workout-1', title: 'Strength', discipline: 'STRENGTH',
  catalogueReleaseId: 'catalogue-1', tags: ['barbell'], blocks: [{ blockId: 'block-1', type: 'EXERCISE',
    exerciseId: 'exercise-squat', exerciseNameSnapshot: 'Squat', efforts: [{ effortId: 'effort-1', effortType: 'WORKING',
      prescriptions: [{ prescriptionId: 'rx-1', metricKey: 'repetitions', targetValue: 5, canonicalUnit: 'repetitions' }] }] }]
});

describe('PublicationRepository', () => {
  beforeEach(() => { state.values.clear(); state.queued.mockClear(); });

  it('canonicalizes keys and republishes unchanged content idempotently', async () => {
    const repository = new PublicationRepository();
    const first = await repository.publish('human-1', 'workout', 'workout-1', workout());
    const reordered = { ...workout(), tags: ['barbell'] };
    const second = await repository.publish('human-1', 'workout', 'workout-1', reordered);
    expect(second.versionId).toBe(first.versionId);
    expect(await repository.listPublishedVersions('human-1', 'workout', 'workout-1')).toHaveLength(1);
  });

  it('creates one immutable new revision for edited content', async () => {
    const repository = new PublicationRepository();
    const original = await repository.publish('human-1', 'workout', 'workout-1', workout());
    const edited = await repository.publish('human-1', 'workout', 'workout-1', { ...workout(), title: 'Strength II' });
    expect(edited.revision).toBe(2);
    expect(edited.versionId).not.toBe(original.versionId);
    expect((await repository.getPublishedVersion<Workout>('human-1', 'workout', original.versionId))?.payload.title).toBe('Strength');
  });

  it('compiles protocol segments deterministically and rejects contradictions', async () => {
    const repository = new PublicationRepository();
    const protocol: Protocol = { schemaVersion: 'humanv1.protocol/1', protocolId: 'protocol-1', title: 'Intervals', summary: '',
      protocolType: 'HIIT', status: 'DRAFT', suitability: [], equipmentCapabilityKeys: [], evidence: [], segments: [
        { segmentId: 'segment-1', phase: 'WORK', durationSeconds: 30, repeatCount: 2, targets: [], exerciseSlotCount: 1, instructions: '' }
      ] };
    const published = await repository.publish('human-1', 'protocol', 'protocol-1', protocol);
    expect(published.compiledTimeline?.map(step => step.startTime)).toEqual([0, 30]);
    await expect(repository.publish('human-1', 'protocol', 'protocol-1', { ...protocol, segments: [{ ...protocol.segments[0], exerciseSlotCount: 0 }] })).rejects.toThrow('INVALID_CONTENT');
  });
});
