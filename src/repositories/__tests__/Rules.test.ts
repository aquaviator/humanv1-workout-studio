import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;
const draft = (humanUserId: string, globalId: string, revision: number) => ({
  schemaVersion: 1, globalId, humanUserId, revision, status: 'DRAFT', payload: {},
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: `2026-01-01T00:00:0${revision}.000Z`, deletedAt: null, originClientId: 'test',
});
const published = (humanUserId: string, globalId: string, contentType: 'workout' | 'plan' | 'protocol') => ({
  schemaVersion: `humanv1.${contentType}/1`, globalId, humanUserId, revision: 1, publicationState: 'PUBLISHED', tombstoneState: 'ACTIVE',
  sourceDraftId: globalId, payload: contentType === 'plan' ? { weeks: [{ placements: [{ workoutVersionId: 'workout-1_r1_aaaaaaaaaaaa' }] }] } : {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  publishedAt: '2026-01-01T00:00:00.000Z', contentChecksum: 'a'.repeat(64), versionId: `${globalId}_v1`, contentType, compatibleTags: [],
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-humanv1-workout-studio',
    firestore: {
      rules: readFileSync(resolve(__dirname, '../../../firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  
  // Seed basic structure via admin to test client interactions
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    
    // Seed trusted identity
    await setDoc(doc(adminDb, 'accounts', 'auth_1'), { humanUserId: 'human_1', status: 'ACTIVE', schemaVersion: 1 });
    await setDoc(doc(adminDb, 'accounts', 'auth_2'), { humanUserId: 'human_2', status: 'ACTIVE', schemaVersion: 1 });
    await setDoc(doc(adminDb, 'users', 'human_1'), { ownerFirebaseUid: 'auth_1', status: 'ACTIVE', schemaVersion: 1 });
    await setDoc(doc(adminDb, 'users', 'human_2'), { ownerFirebaseUid: 'auth_2', status: 'ACTIVE', schemaVersion: 1 });
    await setDoc(doc(adminDb, 'accounts', 'auth_1', 'entitlements', 'current'), {
      schemaVersion: 1, firebaseUid: 'auth_1', humanUserId: 'human_1',
      normalizedState: 'ACTIVE_UNTIL_EXPIRY', productScope: 'WORKOUT_STUDIO',
      expiryAt: new Date('2099-01-01T00:00:00.000Z')
    });
    
    // Seed catalogue
    await setDoc(doc(adminDb, 'exercise_catalogue', 'current'), { releaseId: 'v1', status: 'published', channel: 'production' });
    await setDoc(doc(adminDb, 'exercise_catalogue_releases', 'v1'), { status: 'published', channel: 'production', validationStatus: 'validated' });
  });
});

describe('Firestore Security Rules', () => {
  it('allows only owner read of current and denies all client entitlement mutations', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const bob = testEnv.authenticatedContext('auth_2').firestore();
    const current = doc(alice, 'accounts', 'auth_1', 'entitlements', 'current');
    await assertSucceeds(getDoc(current));
    await assertFails(getDoc(doc(bob, 'accounts', 'auth_1', 'entitlements', 'current')));
    await assertFails(updateDoc(current, { revision: 99 }));
    await assertFails(setDoc(doc(alice, 'accounts', 'auth_1', 'entitlementGrants', 'grant-1'), { status: 'ACTIVE' }));
    await assertFails(setDoc(doc(alice, 'accounts', 'auth_1', 'entitlementEvents', 'event-1'), { action: 'GRANT' }));
  });

  it('fails closed for expired Studio entitlement', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'accounts', 'auth_1', 'entitlements', 'current'), {
        schemaVersion: 1, firebaseUid: 'auth_1', humanUserId: 'human_1',
        normalizedState: 'ACTIVE_UNTIL_EXPIRY', productScope: 'WORKOUT_STUDIO',
        expiryAt: new Date('2020-01-01T00:00:00.000Z')
      });
    });
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'workoutDrafts', 'expired'), draft('human_1', 'expired', 1)));
  });
  it.each([
    ['publishedWorkouts', 'workout'], ['publishedPlans', 'plan'], ['publishedProtocols', 'protocol'],
  ] as const)('allows owner create/read and makes %s immutable', async (collectionName, contentType) => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = published('human_1', `${contentType}-1`, contentType);
    const ref = doc(alice, 'users', 'human_1', collectionName, value.versionId);
    await assertSucceeds(setDoc(ref, value));
    await assertSucceeds(getDoc(ref));
    await assertFails(updateDoc(ref, { revision: 2 }));
    await assertFails(deleteDoc(ref));
  });

  it('denies cross-owner publication reads/writes and owner reassignment', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const bob = testEnv.authenticatedContext('auth_2').firestore();
    const value = published('human_1', 'workout-1', 'workout');
    const ref = doc(alice, 'users', 'human_1', 'publishedWorkouts', value.versionId);
    await assertSucceeds(setDoc(ref, value));
    await assertFails(getDoc(doc(bob, 'users', 'human_1', 'publishedWorkouts', value.versionId)));
    await assertFails(setDoc(doc(bob, 'users', 'human_1', 'publishedWorkouts', 'workout-2_v1'), published('human_1', 'workout-2', 'workout')));
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'publishedWorkouts', 'workout-3_v1'), published('human_2', 'workout-3', 'workout')));
  });

  it('rejects malformed publication contract fields', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const valid = published('human_1', 'workout-1', 'workout');
    const base = collection(alice, 'users', 'human_1', 'publishedWorkouts');
    await assertFails(setDoc(doc(base, 'bad-schema'), { ...valid, versionId: 'bad-schema', schemaVersion: 1 }));
    await assertFails(setDoc(doc(base, 'bad-type'), { ...valid, versionId: 'bad-type', contentType: 'plan' }));
    await assertFails(setDoc(doc(base, 'bad-revision'), { ...valid, versionId: 'bad-revision', revision: 0 }));
    await assertFails(setDoc(doc(base, 'bad-checksum'), { ...valid, versionId: 'bad-checksum', contentChecksum: 'short' }));
    await assertFails(setDoc(doc(base, 'bad-checksum-alphabet'), { ...valid, versionId: 'bad-checksum-alphabet', contentChecksum: 'z'.repeat(64) }));
    await assertFails(setDoc(doc(base, 'bad-state-pair'), { ...valid, versionId: 'bad-state-pair', publicationState: 'PUBLISHED', tombstoneState: 'SOFT_DELETED' }));
  });
  
  // 1. Identity mapping is client read-only.
  it('allows reading own identity but denies writing', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    
    // Read succeeds
    await assertSucceeds(getDoc(doc(alice, 'accounts', 'auth_1')));
    
    // Write denied
    await assertFails(setDoc(doc(alice, 'accounts', 'auth_1'), { humanUserId: 'human_x' }));
    await assertFails(updateDoc(doc(alice, 'accounts', 'auth_1'), { humanUserId: 'human_x' }));
    await assertFails(deleteDoc(doc(alice, 'accounts', 'auth_1')));
  });

  // Identity forgery is denied
  it('denies reading or writing other identities', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    
    // Read cross
    await assertFails(getDoc(doc(alice, 'accounts', 'auth_2')));
    // Write cross
    await assertFails(setDoc(doc(alice, 'accounts', 'auth_2'), { humanUserId: 'human_2' }));
  });

  // Cross-owner reads and writes are denied
  it('denies cross-owner document access', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    
    // Alice tries to read Bob's workout
    await assertFails(getDoc(doc(alice, 'users', 'human_2', 'workoutDrafts', 'workout_1')));
    
    // Alice tries to write to Bob's workouts
    await assertFails(setDoc(doc(alice, 'users', 'human_2', 'workoutDrafts', 'workout_1'), {
      humanUserId: 'human_2',
      schemaVersion: 1, revision: 1, globalId: 'workout_1', status: 'DRAFT', payload: {}, createdAt: '2026-01-01', updatedAt: '2026-01-01', deletedAt: null, originClientId: 'test'
    }));
  });

  // Catalogue pointer and releases are client read-only
  it('allows catalogue read but denies write', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    
    await assertSucceeds(getDoc(doc(alice, 'exercise_catalogue', 'current')));
    await assertSucceeds(getDoc(doc(alice, 'exercise_catalogue_releases', 'v1')));
    
    await assertFails(setDoc(doc(alice, 'exercise_catalogue', 'current'), { releaseId: 'v2' }));
    await assertFails(setDoc(doc(alice, 'exercise_catalogue_releases', 'v1'), { count: 2 }));
  });

  // Staging is denied
  it('denies staging reads and writes completely', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    await assertFails(getDoc(doc(alice, 'staging_exercises', 'some_doc')));
    await assertFails(setDoc(doc(alice, 'staging_exercises', 'some_doc'), { data: 1 }));
  });

  // Only explicit supported user collections are allowed. Unknown collection names are denied.
  it('denies unknown collections inside humans path', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    
    // workouts is explicitly allowed
    await assertSucceeds(setDoc(doc(alice, 'users', 'human_1', 'workoutDrafts', 'w1'), draft('human_1', 'w1', 1)));
    
    // secret_stuff is NOT allowed
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'secret_stuff', 's1'), {
      humanUserId: 'human_1',
      schemaVersion: '1',
      revision: 1
    }));
  });

  // Owner fields cannot change
  it('denies changing humanUserId on update', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const docRef = doc(alice, 'users', 'human_1', 'workoutDrafts', 'w1');
    
    await assertSucceeds(setDoc(docRef, draft('human_1', 'w1', 1)));
    
    // Try to change humanUserId
    await assertFails(updateDoc(docRef, {
      humanUserId: 'human_99',
      revision: 2
    }));
  });

  // Revisions follow the governed contract
  it('enforces revision increment on update', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const docRef = doc(alice, 'users', 'human_1', 'workoutDrafts', 'w1');
    
    await assertSucceeds(setDoc(docRef, draft('human_1', 'w1', 1)));
    
    // Valid update (increment revision)
    await assertSucceeds(updateDoc(docRef, {
      revision: 2
    }));
    
    // Invalid update (same revision)
    await assertFails(updateDoc(docRef, {
      revision: 2
    }));
  });

  // Tombstone behavior follows governed contract (no delete)
  it('denies hard deletes', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const docRef = doc(alice, 'users', 'human_1', 'workoutDrafts', 'w1');
    
    await assertSucceeds(setDoc(docRef, draft('human_1', 'w1', 1)));
    
    await assertFails(deleteDoc(docRef));
  });

  // Malformed schemas are denied
  it('denies if schemaVersion is missing or not a string', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const docRef = doc(alice, 'users', 'human_1', 'workoutDrafts', 'w2');
    
    // Missing schemaVersion
    await assertFails(setDoc(docRef, {
      humanUserId: 'human_1',
      revision: 1
    }));
    
    // schemaVersion is number instead of string
    await assertFails(setDoc(docRef, {
      humanUserId: 'human_1',
      schemaVersion: '1',
      revision: 1
    }));
  });

  it('enforces private exercise namespace, immutable ownership, monotonic revisions and tombstones', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const base = { schemaVersion: 1, globalId: 'private_12345678', id: 'private_12345678', humanUserId: 'human_1', name: 'Private timer', category: 'Cardio', isCustom: true, createdAt: 1, updatedAt: 1, deletedAt: null, revision: 1, originDeviceId: 'WORKOUT_STUDIO' };
    const ref = doc(alice, 'users', 'human_1', 'customExercises', base.globalId);
    await assertSucceeds(setDoc(ref, base));
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'customExercises', 'governed_id'), { ...base, globalId: 'governed_id', id: 'governed_id' }));
    await assertFails(updateDoc(ref, { revision: 1, name: 'collision' }));
    await assertFails(updateDoc(ref, { revision: 2, humanUserId: 'human_2' }));
    await assertSucceeds(updateDoc(ref, { revision: 2, updatedAt: 2, deletedAt: 2 }));
    await assertFails(deleteDoc(ref));
  });

  const androidPrivate = (globalId = 'exercise_6cc2f8f0d0a5') => ({
    globalId, id: 'custom_3deb463a-eda2-416b-86ac-931463496ec9',
    humanUserId: 'human_1', name: 'Android private', category: 'Chest', isCustom: true,
    createdAt: 10, updatedAt: 10, deletedAt: null, revision: 1,
    originDeviceId: 'device_android_1', lastSyncedAt: 11,
  });
  const studioPrivate = (globalId = 'private_12345678') => ({
    schemaVersion: 1, globalId, id: globalId, humanUserId: 'human_1',
    name: 'Studio private', description: null, category: 'Cardio', equipment: [],
    primaryMuscles: [], muscleArea: [], modalitySuitability: [],
    capabilities: { primary: ['duration'], secondary: [], optional: [], unsupported: ['external_load'] },
    isCustom: true, createdAt: 10, updatedAt: 10, deletedAt: null, revision: 1,
    originApplication: 'WORKOUT_STUDIO', originDeviceId: 'WORKOUT_STUDIO', lastSyncedAt: 11,
  });

  it('accepts the exact Android private-exercise wire shape', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate();
    await assertSucceeds(setDoc(doc(alice, 'users', 'human_1', 'customExercises', value.globalId), value));
  });

  it('accepts the exact Studio private-exercise wire shape', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = studioPrivate();
    await assertSucceeds(setDoc(doc(alice, 'users', 'human_1', 'customExercises', value.globalId), value));
  });

  it('allows a clean owner client to reconstruct a private exercise', async () => {
    const writer = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate('exercise_clean123');
    const ref = doc(writer, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    const cleanClient = testEnv.authenticatedContext('auth_1').firestore();
    await assertSucceeds(getDoc(doc(cleanClient, 'users', 'human_1', 'customExercises', value.globalId)));
  });

  it('denies private-exercise owner reassignment', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate('exercise_owner123');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertFails(updateDoc(ref, { humanUserId: 'human_2', revision: 2, updatedAt: 12 }));
  });

  it('denies cross-owner private-exercise reads and writes', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const bob = testEnv.authenticatedContext('auth_2').firestore();
    const value = androidPrivate('exercise_cross123');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertFails(getDoc(doc(bob, 'users', 'human_1', 'customExercises', value.globalId)));
    await assertFails(setDoc(doc(bob, 'users', 'human_1', 'customExercises', 'exercise_forged12'), androidPrivate('exercise_forged12')));
  });

  it('denies governed-ID collision in the private collection', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'customExercises', 'bench_press'), {
      ...androidPrivate('bench_press'), globalId: 'bench_press', id: 'bench_press',
    }));
  });

  it('denies hard deletion of a private exercise', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate('exercise_delete12');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertFails(deleteDoc(ref));
  });

  it('accepts a valid private-exercise revision increment', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate('exercise_update12');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertSucceeds(updateDoc(ref, { revision: 2, updatedAt: 12, name: 'Updated private' }));
  });

  it('denies stale and equal private-exercise revisions', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = androidPrivate('exercise_stale123');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertSucceeds(updateDoc(ref, { revision: 2, updatedAt: 12 }));
    await assertFails(updateDoc(ref, { revision: 2, updatedAt: 13 }));
    await assertFails(updateDoc(ref, { revision: 1, updatedAt: 14 }));
  });

  it('archives and restores only through increasing revisions', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = studioPrivate('private_archive12');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await setDoc(ref, value);
    await assertSucceeds(updateDoc(ref, { revision: 2, updatedAt: 12, deletedAt: 12 }));
    await assertFails(updateDoc(ref, { revision: 2, updatedAt: 13, deletedAt: null }));
    await assertSucceeds(updateDoc(ref, { revision: 3, updatedAt: 14, deletedAt: null }));
  });

  it('denies malformed capability and field representations', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const value = studioPrivate('private_malformed12');
    const ref = doc(alice, 'users', 'human_1', 'customExercises', value.globalId);
    await assertFails(setDoc(ref, { ...value, capabilities: { ...value.capabilities, primary: ['telepathy'] } }));
    await assertFails(setDoc(ref, { ...value, createdAt: '10' }));
    await assertFails(setDoc(ref, { ...value, unexpectedAuthority: true }));
  });

  it('keeps existing valid private-exercise documents readable', async () => {
    await testEnv.withSecurityRulesDisabled(async context => {
      await setDoc(doc(context.firestore(), 'users', 'human_1', 'customExercises', 'custom_legacy123'), {
        globalId: 'custom_legacy123', id: 'custom_legacy123', humanUserId: 'human_1',
        name: 'Existing private', category: 'Other', isCustom: true,
        createdAt: 1, updatedAt: 1, deletedAt: null, revision: 1, originDeviceId: 'legacy-device',
      });
    });
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    await assertSucceeds(getDoc(doc(alice, 'users', 'human_1', 'customExercises', 'custom_legacy123')));
  });

  it('enforces owner-bound normalized routine records and denies hard deletes', async () => {
    const alice = testEnv.authenticatedContext('auth_1').firestore();
    const template = { globalId: 'routine_1', humanUserId: 'human_1', name: 'Routine', exerciseIdsJson: '[]', createdAt: 1, updatedAt: 1, deletedAt: null, revision: 1, originDeviceId: 'app' };
    const ref = doc(alice, 'users', 'human_1', 'templates', 'routine_1');
    await assertSucceeds(setDoc(ref, template));
    await assertFails(updateDoc(ref, { revision: 1, name: 'collision' }));
    await assertSucceeds(updateDoc(ref, { revision: 2, updatedAt: 2, name: 'Edited' }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(doc(alice, 'users', 'human_1', 'templateExercises', 'slot_1'), { globalId: 'slot_1', humanUserId: 'human_2', templateGlobalId: 'routine_1', exerciseId: 'squat', position: 0, createdAt: 1, updatedAt: 1, deletedAt: null, revision: 1, originDeviceId: 'app' }));
  });
});
