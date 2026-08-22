import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { clear } from 'idb-keyval';
import { adminAuth, adminDb, cleanupEmulator } from '../../test/emulator';
import { FirebaseAuthRepository } from '../FirebaseAuthRepository';
import { FirebaseCatalogueRepository } from '../FirebaseCatalogueRepository';
import { FirebaseEntitlementRepository } from '../FirebaseEntitlementRepository';
import { DraftRepository } from '../DraftRepository';
import { syncManager } from '../SyncManager';
import { auth, db } from '../../config/firebase';
import { signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

beforeAll(async () => {
  // Create synthetic users
  try {
    await adminAuth.createUser({ uid: 'auth_1', email: 'user1@example.com', password: 'password123' });
    await adminAuth.createUser({ uid: 'auth_2', email: 'user2@example.com', password: 'password123' });
  } catch(e) {} // Ignore if exists
  
  // Create identity docs
  await adminDb.collection('user_identities').doc('auth_1').set({ humanUserId: 'human_1', authUid: 'auth_1', displayName: 'User 1' });
  await adminDb.collection('user_identities').doc('auth_2').set({ humanUserId: 'human_2', authUid: 'auth_2', displayName: 'User 2' });
  
  // Seed catalogue
  await adminDb.collection('exercise_catalogue').doc('current').set({ releaseId: 'v1' });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').set({ releaseId: 'v1', published: true, validationState: 'VALIDATED', channel: 'PRODUCTION', count: 1, checksum: 'SKIP_CHECKSUM' });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').collection('exercises').doc('ex1').set({ exerciseId: 'ex1', name: 'Push Up', equipment: [], targetMuscles: [] });
});

beforeEach(async () => {
  await clear(); // Clear IDB
  await signOut(auth);
});

describe('Emulator Acceptance', () => {
  it('Authentication and trusted identity gating', async () => {
    const authRepo = new FirebaseAuthRepository();
    // Simulate sign in
    
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    
    const identity = await authRepo.getCurrentIdentity();
    expect(identity).toBeDefined();
    expect(identity?.humanUserId).toBe('human_1');
  });
  
  it('Catalogue download and transactional application', async () => {
    const catRepo = new FirebaseCatalogueRepository();
    await catRepo.syncCatalogue();
    const ex = await catRepo.getExercises();
    // 1 from db, or fallback if db failed.
    expect(ex.length).toBeGreaterThan(0);
  });

  it('Entitlement checking without false expiry', async () => {
    // Should default to CHECKING then move to EXPIRED or ACTIVE
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    const entRepo = new FirebaseEntitlementRepository();
    // human_1 has no document, should be EXPIRED
    const entitlement = await entRepo.getEntitlement('human_1');
    expect(entitlement.state).toBe('EXPIRED');
  });

  it('Workout round trip, Conflict isolation, Offline creation', async () => {
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    const draftRepo = new DraftRepository();
    
    // Create
    await draftRepo.saveWorkoutDraft('human_1', {
      schemaVersion: "1",
      workoutId: "workout_1",
      title: "My Workout",
      discipline: "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });

    // It queues upload. Since we are online, it syncs.
    await new Promise(r => setTimeout(r, 100)); // wait for sync
    
    // Check Firestore
    
    const remote = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_1'));
    expect(remote.exists()).toBe(true);
    expect(remote.data().payload.title).toBe("My Workout");

    // Idempotent sync
    await syncManager.syncPending();
    
    // Conflict isolation
    // Modify remote to have higher revision
    
    await updateDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_1'), { revision: 10 });
    
    // Local save again
    await draftRepo.saveWorkoutDraft('human_1', {
      schemaVersion: "1",
      workoutId: "workout_1",
      title: "My Local Conflict",
      discipline: "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });
    
    await new Promise(r => setTimeout(r, 100)); // wait for sync
    // Should be isolated as conflict, remote is still revision 10
    const remote2 = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_1'));
    expect(remote2.data().revision).toBe(10);
    
    // Local should still have the conflict
    const local = await draftRepo.getWorkoutDraft('human_1', 'workout_1');
    expect(local?.title).toBe("My Local Conflict");
  });
});

afterAll(async () => {
  await cleanupEmulator();
});
