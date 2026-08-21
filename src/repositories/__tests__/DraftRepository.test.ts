import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DraftRepository } from '../DraftRepository';
import { get, set, del } from 'idb-keyval';
import { Workout } from '../../domain/types';

vi.mock('idb-keyval', () => {
  const store = new Map();
  return {
    get: vi.fn(key => Promise.resolve(store.get(key))),
    set: vi.fn((key, val) => {
      store.set(key, val);
      return Promise.resolve();
    }),
    del: vi.fn(key => {
      store.delete(key);
      return Promise.resolve();
    }),
    _store: store
  };
});

describe('DraftRepository', () => {
  let repo: DraftRepository;

  beforeEach(async () => {
    repo = new DraftRepository();
    // @ts-ignore
    const store = (await import('idb-keyval'))._store;
    if (store) store.clear();
  });

  it('saves and retrieves a workout draft', async () => {
    const mockWorkout: Workout = {
      schemaVersion: 'humanv1.workout/1',
      workoutId: 'w-1',
      title: 'Test',
      discipline: 'STRENGTH',
      catalogueReleaseId: 'v1',
      tags: [],
      blocks: []
    };

    await repo.saveWorkoutDraft('u-1', mockWorkout);
    const retrieved = await repo.getWorkoutDraft('u-1', 'w-1');
    expect(retrieved?.title).toBe('Test');
    
    // Save again
    mockWorkout.title = 'Updated';
    await repo.saveWorkoutDraft('u-1', mockWorkout);
    const updated = await repo.getWorkoutDraft('u-1', 'w-1');
    expect(updated?.title).toBe('Updated');
  });

  it('deletes a workout draft by marking deletedAt', async () => {
    const mockWorkout: Workout = {
      schemaVersion: 'humanv1.workout/1',
      workoutId: 'w-2',
      title: 'Test 2',
      discipline: 'STRENGTH',
      catalogueReleaseId: 'v1',
      tags: [],
      blocks: []
    };
    
    await repo.saveWorkoutDraft('u-1', mockWorkout);
    await repo.deleteWorkoutDraft('u-1', 'w-2');
    
    const retrieved = await repo.getWorkoutDraft('u-1', 'w-2');
    expect(retrieved).toBeNull();
  });
});
