import { createHash } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-humanv1-workout-studio';
const uid = 'browser_owner_uid';
const owner = 'human_browserowner01';
const releaseId = 'strength-2026.08.36-v1';
const exerciseIds = ['browser_push_up', 'squat', 'bench_press', 'barbell_row', 'plank', 'farmers_carry', 'romanian_deadlift', 'overhead_press', 'assisted_pull_up', 'bulgarian_split_squat', 'outdoor_walk', 'outdoor_run', 'stationary_bike', 'worlds_greatest_stretch', 'open_book_stretch', 'wall_angels'];
const exercises = exerciseIds.map(exerciseId => ({ schemaVersion: 1, exerciseId, displayName: exerciseId === 'browser_push_up' ? 'Push Up' : exerciseId.split('_').map(word => word[0].toUpperCase() + word.slice(1)).join(' '), category: 'Strength', equipment: [], aliases: [], trackingCapabilities: ['repetitions', 'duration', 'distance'] }));

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

async function waitForEmulator(url: string) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try { await fetch(url); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  throw new Error(`Isolated emulator did not become ready: ${url}`);
}

export default async function globalSetup() {
  if (!projectId.startsWith('demo-') || process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8081') {
    throw new Error('Refusing browser acceptance outside the isolated Firestore emulator');
  }
  process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
  await Promise.all([waitForEmulator('http://127.0.0.1:9098/'), waitForEmulator('http://127.0.0.1:8081/')]);
  const clear = await fetch(`http://127.0.0.1:8081/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' });
  if (!clear.ok) throw new Error(`Unable to reset isolated Firestore emulator: ${clear.status}`);

  const app = initializeApp({ projectId }, 'browser-acceptance');
  const auth = getAuth(app);
  try { await auth.deleteUser(uid); } catch { /* absent is the expected first run */ }
  await auth.createUser({ uid, email: 'browser-owner@example.test', password: 'browser-password-123', displayName: 'Browser Owner' });

  const db = getFirestore(app);
  const checksum = createHash('sha256').update(canonicalJson([...exercises].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)))).digest('hex');
  const batch = db.batch();
  batch.set(db.doc(`accounts/${uid}`), { schemaVersion: 1, humanUserId: owner, status: 'ACTIVE' });
  batch.set(db.doc(`users/${owner}`), { schemaVersion: 1, ownerFirebaseUid: uid, status: 'ACTIVE', displayName: 'Browser Owner' });
  batch.set(db.doc(`accounts/${uid}/entitlements/current`), {
    schemaVersion: 1, firebaseUid: uid, humanUserId: owner, normalizedState: 'ACTIVE_UNTIL_EXPIRY',
    productScope: 'WORKOUT_STUDIO', source: 'SUPPORT', expiryAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
    offlineReceiptValidUntil: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
  });
  batch.set(db.doc('exercise_catalogue/current'), { releaseId, status: 'published', channel: 'production' });
  batch.set(db.doc(`exercise_catalogue_releases/${releaseId}`), {
    schemaVersion: 1, releaseId, catalogueVersion: 'browser-1', exerciseCount: exercises.length,
    contentSha256: checksum, status: 'published', validationStatus: 'validated', channel: 'production', createdAt: FieldValue.serverTimestamp(),
  });
  for (const exercise of exercises) batch.set(db.doc(`exercise_catalogue_releases/${releaseId}/exercises/${exercise.exerciseId}`), exercise);
  batch.set(db.doc(`users/${owner}/workoutDrafts/workout_existing_lower_body`), {
    schemaVersion: 1, globalId: 'workout_existing_lower_body', humanUserId: owner, revision: 1, status: 'DRAFT', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null, originClientId: 'browser-fixture',
    payload: { schemaVersion: 'humanv1.workout/1', workoutId: 'workout_existing_lower_body', title: 'Lower Body Day', discipline: 'STRENGTH', catalogueReleaseId: releaseId, tags: ['existing'], blocks: [{ blockId: 'existing-squat', type: 'EXERCISE', exerciseId: 'squat', exerciseNameSnapshot: 'Barbell Squat', efforts: [{ effortId: 'existing-set', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'existing-rx', metricKey: 'repetitions', targetValue: 5, canonicalUnit: 'count' }] }] }] },
  });
  await batch.commit();
  const [accountCheck, rootCheck, entitlementCheck] = await Promise.all([
    db.doc(`accounts/${uid}`).get(), db.doc(`users/${owner}`).get(), db.doc(`accounts/${uid}/entitlements/current`).get(),
  ]);
  if (!accountCheck.exists || accountCheck.data()?.humanUserId !== owner || !rootCheck.exists || rootCheck.data()?.ownerFirebaseUid !== uid ||
      !entitlementCheck.exists || entitlementCheck.data()?.humanUserId !== owner) throw new Error('Trusted browser identity fixture is not readable from the demo Admin SDK');
  await deleteApp(app);
  for (const stale of getApps().filter(item => item.name === 'browser-acceptance')) await deleteApp(stale);
}
