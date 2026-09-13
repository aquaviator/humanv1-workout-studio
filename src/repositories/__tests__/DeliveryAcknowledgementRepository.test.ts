import { describe, expect, it, vi } from 'vitest';

vi.mock('../../config/firebase', () => ({ db: {} }));

import { DeliveryAcknowledgementRepository } from '../DeliveryAcknowledgementRepository';

const ack = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1, acknowledgementId: 'strength_1', humanUserId: 'human-1',
  workoutGlobalId: 'workout-1', versionId: 'workout-1_r1_abc', applicationId: 'HUMAN_STRENGTH',
  appliedChecksum: 'a'.repeat(64), sourceRevision: 1, state: 'APPLIED', reasonCode: null,
  ...overrides
});

describe('DeliveryAcknowledgementRepository', () => {
  it('returns only owned Human Strength results for the requested workout, newest first', async () => {
    const load = vi.fn(async () => [ack(), ack({ sourceRevision: 2, versionId: 'workout-1_r2_def' }),
      ack({ humanUserId: 'human-2' }), ack({ workoutGlobalId: 'workout-2' }),
      ack({ applicationId: 'OTHER_APP' }), ack({ state: 'RECEIVED' })]);
    const values = await new DeliveryAcknowledgementRepository(load).listForWorkout('human-1', 'workout-1');
    expect(load).toHaveBeenCalledWith('human-1');
    expect(values.map(value => value.sourceRevision)).toEqual([2, 1]);
  });

  it('retains typed conflict and rejection results without accepting malformed records', async () => {
    const values = await new DeliveryAcknowledgementRepository(async () => [
      ack({ state: 'CONFLICT', reasonCode: 'LOCAL_EDIT_CONFLICT' }),
      ack({ state: 'REJECTED', reasonCode: 'CHECKSUM_MISMATCH' }),
      null, ack({ sourceRevision: 'one' }), ack({ reasonCode: { private: 'payload' } })
    ]).listForWorkout('human-1', 'workout-1');
    expect(values.map(value => [value.state, value.reasonCode])).toEqual([
      ['CONFLICT', 'LOCAL_EDIT_CONFLICT'], ['REJECTED', 'CHECKSUM_MISMATCH']
    ]);
  });
});

describe('plan delivery acknowledgements', () => {
  it('accepts only the exact owner, plan version, checksum, revision and dependency set', async () => {
    const exact = { schemaVersion: 1, humanUserId: 'human_1', applicationId: 'HUMAN_STRENGTH', planGlobalId: 'plan_1', planVersionId: 'plan_1_r1', planChecksum: 'a'.repeat(64), sourceRevision: 1, workoutVersionIds: ['workout_b_r1', 'workout_a_r1'], state: 'APPLIED', reasonCode: null };
    const repository = new DeliveryAcknowledgementRepository(async () => [], async () => [
      { id: 'wrong', data: { ...exact, planChecksum: 'b'.repeat(64) } }, { id: 'exact', data: exact },
    ]);
    await expect(repository.findExactPlan('human_1', { planGlobalId: 'plan_1', planVersionId: 'plan_1_r1', planChecksum: 'a'.repeat(64), sourceRevision: 1, workoutVersionIds: ['workout_a_r1', 'workout_b_r1'] }))
      .resolves.toMatchObject({ acknowledgementId: 'exact', state: 'APPLIED' });
    await expect(repository.findExactPlan('human_1', { planGlobalId: 'plan_1', planVersionId: 'plan_1_r1', planChecksum: 'a'.repeat(64), sourceRevision: 1, workoutVersionIds: ['workout_a_r1'] })).resolves.toBeNull();
  });
});
