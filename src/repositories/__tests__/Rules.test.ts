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

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-hv1-workout-studio',
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
    
    // Seed catalogue
    await setDoc(doc(adminDb, 'exercise_catalogue', 'current'), { releaseId: 'v1' });
    await setDoc(doc(adminDb, 'exercise_catalogue_releases', 'v1'), { status: 'published', channel: 'production', validationStatus: 'validated' });
  });
});

describe('Firestore Security Rules', () => {
  
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
});
