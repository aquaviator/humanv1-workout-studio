import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signInWithPopup: vi.fn(),
  getDoc: vi.fn(),
}));

vi.mock('../../config/env', () => ({ env: { useEmulator: false } }));
vi.mock('../../config/firebase', () => ({
  auth: { authStateReady: vi.fn(), currentUser: null },
  db: {},
}));
vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signInWithPopup: mocks.signInWithPopup,
  signOut: mocks.signOut,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn((...segments: unknown[]) => segments.join('/')),
  getDoc: mocks.getDoc,
}));

import { FirebaseAuthRepository } from '../FirebaseAuthRepository';

describe('FirebaseAuthRepository trusted identity sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPopup.mockResolvedValue({
      user: { uid: 'auth-unprovisioned', email: 'primary@example.com', displayName: 'Human' },
    });
  });

  it('signs out and explains when Google succeeds without a trusted mapping', async () => {
    mocks.getDoc.mockResolvedValue({ exists: () => false });
    const repository = new FirebaseAuthRepository();

    await expect(repository.signIn()).rejects.toThrow(
      'Google sign-in succeeded, but this account has not been provisioned with a trusted HumanV1 identity.',
    );
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('retains a Google session only after forward and reverse ownership resolve', async () => {
    mocks.getDoc
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ humanUserId: 'human-1', status: 'ACTIVE', schemaVersion: 1 }) })
      .mockResolvedValueOnce({ exists: () => true, data: () => ({ ownerFirebaseUid: 'auth-unprovisioned', status: 'ACTIVE', schemaVersion: 1, displayName: 'Human' }) });
    const repository = new FirebaseAuthRepository();

    await expect(repository.signIn()).resolves.toBeUndefined();
    expect(mocks.signOut).not.toHaveBeenCalled();
    await expect(repository.getCurrentIdentity()).resolves.toBeNull();
  });
});
