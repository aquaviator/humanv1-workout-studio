import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, value: unknown) => { store.set(key, structuredClone(value)); return Promise.resolve(); }),
}));

import { PlanDeliveryRepository } from '../PlanDeliveryRepository';

describe('PlanDeliveryRepository', () => {
  beforeEach(() => store.clear());

  it('survives repository reconstruction with stable publication IDs and truthful waiting status', async () => {
    const attempt = {
      humanUserId: 'synthetic_owner', planId: 'plan_stable_1', planVersionId: 'plan_stable_1_r1_abcdef123456',
      workoutVersionIds: ['workout_stable_1_r1_abcdef123456'], phase: 'WAITING_FOR_HUMANV1' as const,
      lastAttemptedAt: '2026-09-12T10:00:00.000Z',
    };
    await new PlanDeliveryRepository().save(attempt);
    expect(await new PlanDeliveryRepository().load('synthetic_owner', 'plan_stable_1')).toEqual(attempt);
    expect(await new PlanDeliveryRepository().load('other_owner', 'plan_stable_1')).toBeNull();
  });
});
