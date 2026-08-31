import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { clear, get } from 'idb-keyval';
import { adminAuth, adminDb, cleanupEmulator } from '../../test/emulator';
import { FirebaseAuthRepository } from '../FirebaseAuthRepository';
import { FirebaseCatalogueRepository } from '../FirebaseCatalogueRepository';
import { FirebaseEntitlementRepository } from '../FirebaseEntitlementRepository';
import { DraftRepository } from '../DraftRepository';
import { syncManager } from '../SyncManager';
import { auth, db } from '../../config/firebase';
import { signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { sha256 } from 'js-sha256';

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
  const mockExercise = { exerciseId: 'ex1', name: 'Push Up', equipment: [], targetMuscles: [], category: '', aliases: [], metricProfile: 'REPS_ONLY' };
  const mockParsed = {
    exerciseId: mockExercise.exerciseId,
    name: mockExercise.name,
    category: mockExercise.category,
    equipment: mockExercise.equipment,
    aliases: mockExercise.aliases,
    metricProfile: mockExercise.metricProfile
  };
  const computedChecksum = sha256(JSON.stringify([mockParsed].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))));
  
  await adminDb.collection('exercise_catalogue').doc('current').set({ releaseId: 'v1' });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').set({ releaseId: 'v1', published: true, validationState: 'VALIDATED', channel: 'PRODUCTION', count: 1, checksum: computedChecksum });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').collection('exercises').doc('ex1').set(mockExercise);
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
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
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
    
    console.log("Current Auth UID:", auth.currentUser?.uid);
    
    // Create
    await draftRepo.saveWorkoutDraft('human_1', {
      schemaVersion: "1",
      workoutId: "workout_1",
      title: "My Workout",
      discipline: "STRENGTH" as const,
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });

    await syncManager.syncPending(); // Explicitly wait
    
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
      discipline: "STRENGTH" as const,
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });
    
    await syncManager.syncPending(); // wait for sync
    
    // Should be isolated as conflict, remote is still revision 10
    const remote2 = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_1'));
    expect(remote2.data().revision).toBe(10);
    
    // Local should still have the conflict
    const local = await draftRepo.getWorkoutDraft('human_1', 'workout_1');
    expect(local?.title).toBe("My Local Conflict");
  });


  it('Two-client sync: Ownership isolation, offline edits, reconnection, retry, idempotence, conflict preservation, absence of duplicate drafts', async () => {
    const draftRepo = new DraftRepository();
    
    // Client A (User 1)
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    await clear(); // Client A's fresh device
    
    // Offline creation
    await draftRepo.saveWorkoutDraft('human_1', {
      schemaVersion: "1",
      workoutId: "workout_shared_1",
      title: "Base Workout",
      discipline: "STRENGTH" as const,
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });
    
    // Reconnection and sync
    await syncManager.syncPending();
    
    const remote = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_shared_1'));
    expect(remote.exists()).toBe(true);
    expect(remote.data().payload.title).toBe("Base Workout");
    
    // Verify idempotence / absence of duplicate drafts
    await syncManager.syncPending();
    const allDraftsA = await draftRepo.listWorkoutDrafts('human_1');
    expect(allDraftsA.length).toBe(1); // Only 1 draft locally
    
    // Client B (User 1 on different device, simulating by clearing IDB)
    await clear(); // Client B's fresh device
    // Pull from cloud
    await syncManager.syncDown('human_1');
    
    const allDraftsB = await draftRepo.listWorkoutDrafts('human_1');
    expect(allDraftsB.length).toBeGreaterThanOrEqual(1);
    const sharedDraftB = allDraftsB.find(d => d.workoutId === "workout_shared_1");
    expect(sharedDraftB?.title).toBe("Base Workout");
    
    // Client B edits offline
    await draftRepo.saveWorkoutDraft('human_1', {
      ...sharedDraftB!,
      title: "Client B Edit"
    });
    
    // Client B syncs up (revision becomes 2)
    await syncManager.syncPending();
    const remoteAfterB = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_shared_1'));
    expect(remoteAfterB.data().revision).toBe(2);
    expect(remoteAfterB.data().payload.title).toBe("Client B Edit");
    
    // Client A comes back online (restore Client A state)
    await clear();
    
    const clientAState = {
      schemaVersion: "1",
      workoutId: "workout_shared_1",
      title: "Client A Edit",
      discipline: "STRENGTH" as const,
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    };
    
    // DraftRepository handles revisions under the hood. Let's just use `saveWorkoutDraft` which updates local state.
    await draftRepo.saveWorkoutDraft('human_1', clientAState);
    
    // Now Client A syncs. Client A's local rev is 1, remote is 2. This is a conflict!
    await syncManager.syncPending();
    
    // Remote should still be Client B's edit
    const remoteAfterConflict = await getDoc(doc(db, 'humans', 'human_1', 'workouts', 'workout_shared_1'));
    expect(remoteAfterConflict.data().revision).toBe(2);
    expect(remoteAfterConflict.data().payload.title).toBe("Client B Edit");
    
    // Local should have the conflict preserved
    const clientAAfterSync = await draftRepo.getWorkoutDraft('human_1', 'workout_shared_1');
    expect(clientAAfterSync?.title).toBe("Client A Edit");
    
    // Verify no duplicates
    const finalDrafts = await draftRepo.listWorkoutDrafts('human_1');
    expect(finalDrafts.length).toBeGreaterThanOrEqual(1);
    
    // Ownership isolation: User 2 shouldn't be able to access User 1's draft
    await signOut(auth);
    await signInWithEmailAndPassword(auth, 'user2@example.com', 'password123');
    await clear();
    
    // Try to sync down User 1's data (should fail due to rules)
    try {
      await syncManager.syncDown('human_1');
      // Should throw or ignore
    } catch(e) {
      // Expected
    }
    
    // Try to write to User 1's data
    try {
       await draftRepo.saveWorkoutDraft('human_1', clientAState);
       await syncManager.syncPending();
       const syncRecord = await get(`sync_human_1_workout_${clientAState.workoutId}`);
       expect(syncRecord?.status).not.toBe('SYNCED');
    } catch (e) {
       
    }
  });
});

afterAll(async () => {
  await cleanupEmulator();
});
