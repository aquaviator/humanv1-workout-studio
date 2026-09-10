import { createHash } from 'node:crypto';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-humanv1-workout-studio';
const uid = 'browser_owner_uid';
const owner = 'human_browser_owner';

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
  const checksum = createHash('sha256').update('[]').digest('hex');
  const batch = db.batch();
  batch.set(db.doc(`accounts/${uid}`), { schemaVersion: 1, humanUserId: owner, status: 'ACTIVE' });
  batch.set(db.doc(`users/${owner}`), { schemaVersion: 1, ownerFirebaseUid: uid, status: 'ACTIVE', displayName: 'Browser Owner' });
  batch.set(db.doc(`accounts/${uid}/entitlements/current`), {
    schemaVersion: 1, firebaseUid: uid, humanUserId: owner, normalizedState: 'ACTIVE_UNTIL_EXPIRY',
    productScope: 'WORKOUT_STUDIO', source: 'SUPPORT', expiryAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
    offlineReceiptValidUntil: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')),
  });
  batch.set(db.doc('exercise_catalogue/current'), { releaseId: 'browser-catalogue', status: 'published', channel: 'production' });
  batch.set(db.doc('exercise_catalogue_releases/browser-catalogue'), {
    schemaVersion: 1, releaseId: 'browser-catalogue', catalogueVersion: 'browser-1', exerciseCount: 0,
    contentSha256: checksum, status: 'published', validationStatus: 'validated', channel: 'production', createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  await deleteApp(app);
  for (const stale of getApps().filter(item => item.name === 'browser-acceptance')) await deleteApp(stale);
}
