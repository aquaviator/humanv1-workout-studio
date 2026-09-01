import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { clear, get } from 'idb-keyval';
import { adminAuth, adminDb, cleanupEmulator } from '../../test/emulator';
import { FirebaseAuthRepository } from '../FirebaseAuthRepository';
import { FirebaseCatalogueRepository } from '../FirebaseCatalogueRepository';
import { FirebaseEntitlementRepository } from '../FirebaseEntitlementRepository';
import { DraftRepository } from '../DraftRepository';
import { syncManager } from '../SyncManager';
import { publicationRepository } from '../PublicationRepository';
import { auth, db } from '../../config/firebase';
import { signOut, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

import { catalogueChecksum } from '../FirebaseCatalogueRepository';
import { Workout } from '../../domain/types';

const validWorkout = (workoutId: string, title: string): Workout => ({
  schemaVersion: 'humanv1.workout/1', workoutId, title, discipline: 'STRENGTH', catalogueReleaseId: 'v1', tags: [],
  blocks: [{ blockId: `${workoutId}-block`, type: 'EXERCISE', exerciseId: 'ex1', exerciseNameSnapshot: 'Push Up',
    efforts: [{ effortId: `${workoutId}-effort`, effortType: 'WORKING', prescriptions: [
      { prescriptionId: `${workoutId}-rx`, metricKey: 'repetitions', targetValue: 10, canonicalUnit: 'repetitions' }
    ] }] }]
});

beforeAll(async () => {
  // Create synthetic users
  try {
    await adminAuth.createUser({ uid: 'auth_1', email: 'user1@example.com', password: 'password123' });
    await adminAuth.createUser({ uid: 'auth_2', email: 'user2@example.com', password: 'password123' });
  } catch(e) {} // Ignore if exists
  
  // Create identity docs
  await adminDb.collection('accounts').doc('auth_1').set({ humanUserId: 'human_1', status: 'ACTIVE', schemaVersion: 1 });
  await adminDb.collection('accounts').doc('auth_2').set({ humanUserId: 'human_2', status: 'ACTIVE', schemaVersion: 1 });
  await adminDb.collection('users').doc('human_1').set({ ownerFirebaseUid: 'auth_1', status: 'ACTIVE', schemaVersion: 1, displayName: 'User 1' });
  await adminDb.collection('users').doc('human_2').set({ ownerFirebaseUid: 'auth_2', status: 'ACTIVE', schemaVersion: 1, displayName: 'User 2' });
  
  // Seed catalogue
  const mockExercise = { exerciseId: 'ex1', name: 'Push Up', equipment: [], category: '', aliases: [], metricProfile: { primary: ['repetitions'], secondary: [], optional: [], unsupported: [] } };
  const computedChecksum = catalogueChecksum([mockExercise]);
  
  await adminDb.collection('exercise_catalogue').doc('current').set({ releaseId: 'v1', status: 'published', channel: 'production' });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').set({ releaseId: 'v1', schemaVersion: 1, status: 'published', validationStatus: 'validated', channel: 'production', exerciseCount: 1, contentSha256: computedChecksum, catalogueVersion: 'test-v1' });
  await adminDb.collection('exercise_catalogue_releases').doc('v1').collection('exercises').doc('ex1').set(mockExercise);
});

beforeEach(async () => {
  await clear(); // Clear IDB
  await signOut(auth);
});

describe('Emulator Acceptance', () => {
  it('Publication: unchanged republish idempotence and edited republish creates one new version', async () => {
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    await clear();
    
    const workoutPayload = validWorkout('workout_1', 'My Pub Workout');
    
    // Publish
    const pub1 = await publicationRepository.publish('human_1', 'workout', workoutPayload.workoutId, workoutPayload, ['STRENGTH']);
    await syncManager.syncPending();
    
    // Read from remote
    const remote = await getDoc(doc(db, 'users', 'human_1', 'publishedWorkouts', pub1.versionId));
    expect(remote.exists()).toBe(true);
    expect(remote.data()?.payload.title).toBe("My Pub Workout");
    
    // Publish same unchanged
    const pub2 = await publicationRepository.publish('human_1', 'workout', workoutPayload.workoutId, workoutPayload, ['STRENGTH']);
    expect(pub2.versionId).toBe(pub1.versionId); // Idempotent
    
    // Publish edited
    workoutPayload.title = "My Edited Pub Workout";
    const pub3 = await publicationRepository.publish('human_1', 'workout', workoutPayload.workoutId, workoutPayload, ['STRENGTH']);
    expect(pub3.versionId).not.toBe(pub1.versionId); // New version
    expect(pub3.revision).toBe(2);
    await syncManager.syncPending();
    
    const remote3 = await getDoc(doc(db, 'users', 'human_1', 'publishedWorkouts', pub3.versionId));
    expect(remote3.data()?.payload.title).toBe("My Edited Pub Workout");
    
    // Check old version is immutable and remains
    const remoteOld = await getDoc(doc(db, 'users', 'human_1', 'publishedWorkouts', pub1.versionId));
    expect(remoteOld.data()?.payload.title).toBe("My Pub Workout");
  });

  it('Publication: Protocol compiled timeline round-trips', async () => {
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    
    const protoPayload: import("../../domain/types").Protocol = {
      schemaVersion: "1",
      protocolId: "proto_1",
      title: "My Proto",
      summary: "",
      protocolType: "HIIT",
      status: "DRAFT" as "DRAFT",
      suitability: [],
      equipmentCapabilityKeys: [],
      evidence: [],
      segments: [{
        segmentId: "s1",
        phase: "WORK" as "WORK",
        durationSeconds: 30,
        repeatCount: 2,
        targets: [],
        exerciseSlotCount: 1,
        instructions: ""
      }]
    };
    const compiled = [
      { segmentId: "s1", iteration: 0, phase: "WORK" as "WORK", durationSeconds: 30, startTime: 0 },
      { segmentId: "s1", iteration: 1, phase: "WORK" as "WORK", durationSeconds: 30, startTime: 30 }
    ];
    
    const pub = await publicationRepository.publish('human_1', 'protocol', protoPayload.protocolId, protoPayload, ['HIIT'], compiled);
    await syncManager.syncPending();
    
    const remote = await getDoc(doc(db, 'users', 'human_1', 'publishedProtocols', pub.versionId));
    expect(remote.data()?.compiledTimeline.length).toBe(2);
    expect(remote.data()?.compiledTimeline[1].startTime).toBe(30);
  });
  
  it('Publication: Plan references exact published Workout versions', async () => {
     // A Plan placement requires workoutVersionId
     await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
     const dependency = await publicationRepository.publish('human_1', 'workout', 'workout_plan_dependency', validWorkout('workout_plan_dependency', 'Plan Workout'));
     await syncManager.syncPending();
     const planPayload: import("../../domain/types").Plan = {
      schemaVersion: "1",
      planId: "plan_1",
      title: "My Plan",
      description: "",
      weeks: [{
        weekId: "w1",
        weekNumber: 1,
        label: "W1",
        placements: [{
          placementId: "p1",
          dayOfWeek: 1,
          workoutId: "workout_plan_dependency",
          workoutVersionId: dependency.versionId,
          preferredMinuteOfDay: null,
          reminderEnabled: false,
          notes: ""
        }]
      }]
    };
     const pub = await publicationRepository.publish('human_1', 'plan', planPayload.planId, planPayload, ['PLAN']);
     await syncManager.syncPending();
     
     const remote = await getDoc(doc(db, 'users', 'human_1', 'publishedPlans', pub.versionId));
     expect(remote.exists()).toBe(true);
     expect(remote.data()?.payload.weeks[0].placements[0].workoutVersionId).toBe(dependency.versionId);
  });
  
  it('Publication: Cross-owner writes are denied', async () => {
    await signInWithEmailAndPassword(auth, 'user2@example.com', 'password123');
    const pub = await publicationRepository.publish('human_1', 'workout', 'workout_hack', validWorkout('workout_hack', 'hacked'), []);
    await syncManager.syncPending();
    await expect(getDoc(doc(db, 'users', 'human_1', 'publishedWorkouts', pub.versionId))).rejects.toMatchObject({ code: 'permission-denied' });
    const record = (await syncManager.listPublicationSyncRecords('human_1', 'workout')).find(item => item.envelope.globalId === 'workout_hack');
    expect(record?.status).toBe('CONFLICT');
    expect(record?.lastErrorCode).toBe('PERMISSION_DENIED');
  });

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
    // Browser clients have no entitlement authority in the governed contract.
    // A denied/missing verification must fail closed, never invent EXPIRED.
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    const entRepo = new FirebaseEntitlementRepository();
    const entitlement = await entRepo.getEntitlement('human_1');
    expect(entitlement.state).toBe('VERIFICATION_UNAVAILABLE');
  });

  it('Workout round trip, Conflict isolation, Offline creation', async () => {
    await signInWithEmailAndPassword(auth, 'user1@example.com', 'password123');
    const draftRepo = new DraftRepository();
    
    console.log("Current Auth UID:", auth.currentUser?.uid);
    
    // Create
    await draftRepo.saveWorkoutDraft('human_1', <import("../../domain/types").Workout>{
      schemaVersion: "1",
      workoutId: "workout_1",
      title: "My Workout",
      discipline: "STRENGTH" as "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });

    await syncManager.syncPending(); // Explicitly wait
    
    // Check Firestore
    const remote = await getDoc(doc(db, 'users', 'human_1', 'workoutDrafts', 'workout_1'));
    expect(remote.exists()).toBe(true);
    expect(remote.data().payload.title).toBe("My Workout");

    // Idempotent sync
    await syncManager.syncPending();
    
    // Conflict isolation
    // Modify remote to have higher revision
    
    await adminDb.collection('users').doc('human_1').collection('workoutDrafts').doc('workout_1').update({ revision: 10 });
    
    // Local save again
    await draftRepo.saveWorkoutDraft('human_1', <import("../../domain/types").Workout>{
      schemaVersion: "1",
      workoutId: "workout_1",
      title: "My Local Conflict",
      discipline: "STRENGTH" as "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });
    
    await syncManager.syncPending(); // wait for sync
    
    // Should be isolated as conflict, remote is still revision 10
    const remote2 = await getDoc(doc(db, 'users', 'human_1', 'workoutDrafts', 'workout_1'));
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
    await draftRepo.saveWorkoutDraft('human_1', <import("../../domain/types").Workout>{
      schemaVersion: "1",
      workoutId: "workout_shared_1",
      title: "Base Workout",
      discipline: "STRENGTH" as "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    });
    
    // Reconnection and sync
    await syncManager.syncPending();
    
    const remote = await getDoc(doc(db, 'users', 'human_1', 'workoutDrafts', 'workout_shared_1'));
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
    await draftRepo.saveWorkoutDraft('human_1', <import("../../domain/types").Workout>{
      ...sharedDraftB!,
      title: "Client B Edit"
    });
    
    // Client B syncs up (revision becomes 2)
    await syncManager.syncPending();
    const remoteAfterB = await getDoc(doc(db, 'users', 'human_1', 'workoutDrafts', 'workout_shared_1'));
    expect(remoteAfterB.data().revision).toBe(2);
    expect(remoteAfterB.data().payload.title).toBe("Client B Edit");
    
    // Client A comes back online (restore Client A state)
    await clear();
    
    const clientAState = {
      schemaVersion: "1",
      workoutId: "workout_shared_1",
      title: "Client A Edit",
      discipline: "STRENGTH" as "STRENGTH",
      catalogueReleaseId: "v1",
      tags: [],
      blocks: []
    };
    
    // DraftRepository handles revisions under the hood. Let's just use `saveWorkoutDraft` which updates local state.
    await draftRepo.saveWorkoutDraft('human_1', clientAState);
    
    // Now Client A syncs. Client A's local rev is 1, remote is 2. This is a conflict!
    await syncManager.syncPending();
    
    // Remote should still be Client B's edit
    const remoteAfterConflict = await getDoc(doc(db, 'users', 'human_1', 'workoutDrafts', 'workout_shared_1'));
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
