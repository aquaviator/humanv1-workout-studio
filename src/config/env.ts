const raw = import.meta.env;
const useEmulator = raw.VITE_USE_FIREBASE_EMULATOR === 'true';
const required = (name: keyof ImportMetaEnv): string => {
  const value = raw[name];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
};
const parseHost = (name: keyof ImportMetaEnv, fallback: string): string => {
  const value = (raw[name] || fallback).trim();
  const host = value.split(':')[0].toLowerCase();
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error(`${name} must use a loopback host in emulator mode`);
  return value;
};
const emulatorProject = 'demo-hv1-workout-studio';
const projectId = useEmulator ? (raw.VITE_FIREBASE_PROJECT_ID || emulatorProject) : required('VITE_FIREBASE_PROJECT_ID');
if (useEmulator && projectId !== emulatorProject) throw new Error(`Emulator mode requires project ${emulatorProject}`);

export const env = {
  isDev: raw.VITE_DEV_MODE === 'true', useEmulator,
  firebase: {
    apiKey: useEmulator ? (raw.VITE_FIREBASE_API_KEY || 'demo-api-key') : required('VITE_FIREBASE_API_KEY'),
    authDomain: useEmulator ? (raw.VITE_FIREBASE_AUTH_DOMAIN || `${emulatorProject}.firebaseapp.com`) : required('VITE_FIREBASE_AUTH_DOMAIN'),
    projectId,
    storageBucket: useEmulator ? (raw.VITE_FIREBASE_STORAGE_BUCKET || `${emulatorProject}.appspot.com`) : required('VITE_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: useEmulator ? (raw.VITE_FIREBASE_MESSAGING_SENDER_ID || '000000000000') : required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    appId: useEmulator ? (raw.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo') : required('VITE_FIREBASE_APP_ID'),
  },
  emulator: {
    authHost: useEmulator ? parseHost('VITE_FIREBASE_AUTH_EMULATOR_HOST', '127.0.0.1:9098') : '',
    firestoreHost: useEmulator ? parseHost('VITE_FIREBASE_FIRESTORE_EMULATOR_HOST', '127.0.0.1:8081') : '',
    authEmail: useEmulator ? required('VITE_FIREBASE_TEST_EMAIL') : '',
    authPassword: useEmulator ? required('VITE_FIREBASE_TEST_PASSWORD') : '',
  },
} as const;
