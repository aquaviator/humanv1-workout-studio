import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authMock, cache } = vi.hoisted(() => ({
  authMock: { currentUser: { uid: 'uid-1', getIdToken: vi.fn(async () => 'token') } },
  cache: new Map<string, unknown>()
}));

vi.mock('../../config/firebase', () => ({ auth: authMock }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => cache.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { cache.set(key, value); })
}));

import { FirebaseEntitlementRepository } from '../FirebaseEntitlementRepository';

const response = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response;

describe('FirebaseEntitlementRepository authoritative account trial', () => {
  beforeEach(() => { cache.clear(); vi.clearAllMocks(); });

  it('maps the Strength backend introductory-access contract', async () => {
    const fetcher = vi.fn(async () => response({ status: 'ACTIVE', trialStartedAtMillis: 1_000, trialEndsAtMillis: 10_000, serverNowMillis: 2_000 }));
    const repository = new FirebaseEntitlementRepository(fetcher as typeof fetch, () => 2_000);
    expect(await repository.getEntitlement('human-1')).toEqual({ state: 'TRIAL_ACTIVE' });
    expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('initializeAccountTrial'), expect.objectContaining({ method: 'POST' }));
  });

  it('preserves consumed introductory access as expired across failed verification', async () => {
    const online = new FirebaseEntitlementRepository(vi.fn(async () => response({ status: 'EXPIRED', trialStartedAtMillis: 1_000, trialEndsAtMillis: 2_000, serverNowMillis: 3_000 })) as typeof fetch, () => 3_000);
    expect(await online.getEntitlement('human-1')).toEqual({ state: 'EXPIRED' });
    const offline = new FirebaseEntitlementRepository(vi.fn(async () => { throw new Error('offline'); }) as typeof fetch, () => 99_000);
    expect(await offline.getEntitlement('human-1')).toEqual({ state: 'EXPIRED' });
  });

  it('uses a valid cached server receipt offline only within its governed window', async () => {
    const online = new FirebaseEntitlementRepository(vi.fn(async () => response({ status: 'ACTIVE', trialStartedAtMillis: 1_000, trialEndsAtMillis: 999_999_999, serverNowMillis: 2_000 })) as typeof fetch, () => 2_000);
    await online.getEntitlement('human-1');
    const withinWindow = new FirebaseEntitlementRepository(vi.fn(async () => { throw new Error('offline'); }) as typeof fetch, () => 2_000 + 6 * 86_400_000);
    expect(await withinWindow.getEntitlement('human-1')).toEqual({ state: 'TRIAL_ACTIVE' });
    const stale = new FirebaseEntitlementRepository(vi.fn(async () => { throw new Error('offline'); }) as typeof fetch, () => 2_000 + 8 * 86_400_000);
    expect(await stale.getEntitlement('human-1')).toEqual({ state: 'VERIFICATION_UNAVAILABLE' });
  });

  it('fails closed when neither backend verification nor an owned receipt exists', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => { throw new Error('offline'); }) as typeof fetch, () => 2_000);
    expect(await repository.getEntitlement('human-1')).toEqual({ state: 'VERIFICATION_UNAVAILABLE' });
  });
});
