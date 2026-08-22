import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9098';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8081';

const app = initializeApp({ projectId: 'demo-humanv1-workout-studio' });
export const adminAuth = getAuth(app);
export const adminDb = getFirestore(app);

export async function cleanupEmulator() {
  await adminDb.terminate();
}
