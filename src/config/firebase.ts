import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { env } from './env';

const app = initializeApp(env.firebase);
const auth = getAuth(app);
const db = getFirestore(app);

if (env.useEmulator) {
  if (!env.firebase.projectId.startsWith('demo-')) {
    throw new Error(`Emulator projects must begin with 'demo-'. Received: ${env.firebase.projectId}`);
  }
  connectAuthEmulator(auth, `http://${env.emulator.authHost}`);
  const [host, port] = env.emulator.firestoreHost.split(':');
  connectFirestoreEmulator(db, host, parseInt(port, 10));
}

export { app, auth, db };
