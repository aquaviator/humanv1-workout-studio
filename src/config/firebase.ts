import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { env } from './env';

const app = initializeApp(env.firebase);
const auth = getAuth(app);
const functions = getFunctions(app, 'europe-west1');
// Identity, entitlement and delivery receipts must remain readable from the
// browser's durable cache after a process restart. Network writes still flow
// only through the repository synchronization queues.
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

if (env.useEmulator) {
  if (!env.firebase.projectId.startsWith('demo-')) {
    throw new Error(`Emulator projects must begin with 'demo-'. Received: ${env.firebase.projectId}`);
  }
  connectAuthEmulator(auth, `http://${env.emulator.authHost}`);
  const [host, port] = env.emulator.firestoreHost.split(':');
  connectFirestoreEmulator(db, host, parseInt(port, 10));
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

export { app, auth, db, functions };
