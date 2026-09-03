import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

const { authMock, cache } = vi.hoisted(() => ({
  authMock: { currentUser: { uid: 'uid-1' } },
  cache: new Map<string, unknown>()
}));

vi.mock('../../config/firebase', () => ({ auth: authMock, db: {} }));
vi.mock('idb-keyval', () => ({
  get: vi.fn(async (key: string) => cache.get(key)),
  set: vi.fn(async (key: string, value: unknown) => { cache.set(key, value); })
}));

import { FirebaseEntitlementRepository } from '../FirebaseEntitlementRepository';

const projection = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  firebaseUid: 'uid-1', humanUserId: 'human-1',
  normalizedState: 'ACTIVE_UNTIL_EXPIRY' as const,
  productScope: 'WORKOUT_STUDIO' as const, source: 'SUPPORT' as const,
  expiryAt: Timestamp.fromMillis(10_000),
  offlineReceiptValidUntil: Timestamp.fromMillis(8_000),
  introductoryState: 'EXPIRED' as const,
  introductoryExpiredAt: Timestamp.fromMillis(1_000),
  ...overrides
});

describe('FirebaseEntitlementRepository current projection', () => {
  beforeEach(() => { cache.clear(); vi.clearAllMocks(); });

  it('maps an owned, active support projection without restarting introductory access', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => projection()), () => 2_000);
    expect(await repository.getEntitlement('human-1')).toEqual({
      state: 'ACTIVE_UNTIL_EXPIRY', source: 'SUPPORT', expiresAt: new Date(10_000).toISOString(),
      introductoryState: 'EXPIRED', introductoryExpiredAt: new Date(1_000).toISOString()
    });
  });

  it('accepts a fresh authoritative projection after its offline receipt window while support remains active', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => projection()), () => 9_000);
    expect(await repository.getEntitlement('human-1')).toEqual({
      state: 'ACTIVE_UNTIL_EXPIRY', source: 'SUPPORT', expiresAt: new Date(10_000).toISOString(),
      introductoryState: 'EXPIRED', introductoryExpiredAt: new Date(1_000).toISOString()
    });
  });

  it('fails closed for a mismatched owner or product', async () => {
    const wrongOwner = new FirebaseEntitlementRepository(vi.fn(async () => projection({ firebaseUid: 'other' })), () => 2_000);
    expect(await wrongOwner.getEntitlement('human-1')).toEqual({ state: 'VERIFICATION_UNAVAILABLE' });
  });

  it('selects the Workout Studio scope from a simultaneous multi-product projection', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => projection({
      productScope: undefined,
      products: {
        HUMAN_STRENGTH: { normalizedState: 'ACTIVE_UNTIL_EXPIRY', source: 'SUPPORT', expiryAt: Timestamp.fromMillis(20_000) },
        WORKOUT_STUDIO: { normalizedState: 'ACTIVE_UNTIL_EXPIRY', source: 'SUPPORT', expiryAt: Timestamp.fromMillis(10_000), offlineReceiptValidUntil: Timestamp.fromMillis(8_000) }
      }
    })), () => 2_000);
    expect(await repository.getEntitlement('human-1')).toEqual(expect.objectContaining({
      state: 'ACTIVE_UNTIL_EXPIRY', expiresAt: new Date(10_000).toISOString()
    }));
  });

  it('uses the owner-bound cache only inside its governed offline window', async () => {
    await new FirebaseEntitlementRepository(vi.fn(async () => projection()), () => 2_000).getEntitlement('human-1');
    const offline = vi.fn(async () => { throw new Error('offline'); });
    expect((await new FirebaseEntitlementRepository(offline, () => 7_000).getEntitlement('human-1')).state).toBe('ACTIVE_UNTIL_EXPIRY');
    expect(await new FirebaseEntitlementRepository(offline, () => 9_000).getEntitlement('human-1')).toEqual(expect.objectContaining({ state: 'VERIFICATION_UNAVAILABLE' }));
  });

  it('expires locally only as a fail-closed reduction and never creates access', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => projection()), () => 11_000);
    expect(await repository.getEntitlement('human-1')).toEqual(expect.objectContaining({ state: 'EXPIRED', introductoryState: 'EXPIRED' }));
  });

  it('fails closed when no authoritative or cached projection exists', async () => {
    const repository = new FirebaseEntitlementRepository(vi.fn(async () => { throw new Error('offline'); }), () => 2_000);
    expect(await repository.getEntitlement('human-1')).toEqual({ state: 'VERIFICATION_UNAVAILABLE' });
  });
});
