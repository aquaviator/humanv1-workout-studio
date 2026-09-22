import { describe, expect, it } from 'vitest';
import type { Workout } from '../../types';
import { validateWorkout } from '../workoutValidation';

const workout = (value: Partial<Workout> = {}): Workout => ({ schemaVersion: 'humanv1.workout/1', workoutId: 'w1', title: 'Workout',
  discipline: 'STRENGTH', catalogueReleaseId: 'release', tags: [], blocks: [{ blockId: 'b1', type: 'EXERCISE', exerciseId: 'e1', exerciseNameSnapshot: 'Exercise', efforts: [{ effortId: 's1', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'p1', metricKey: 'repetitions', targetValue: 8 }] }] }], ...value });

describe('workout narrative validation', () => {
  it('keeps missing legacy and user-authored narrative truthful and optional', () => expect(validateWorkout(workout(), [])).toEqual([]));
  it('requires governed narrative and rejects oversized values', () => {
    expect(validateWorkout(workout({ draftOrigin: 'GOVERNED_IMPORT' }), []).map(item => item.rule)).toEqual(expect.arrayContaining(['GOVERNED_DESCRIPTION_REQUIRED', 'GOVERNED_PURPOSE_REQUIRED']));
    expect(validateWorkout(workout({ description: 'x'.repeat(1201), purpose: 'x'.repeat(601) }), []).map(item => item.rule)).toEqual(expect.arrayContaining(['WORKOUT_DESCRIPTION_TOO_LONG', 'WORKOUT_PURPOSE_TOO_LONG']));
  });
});
