export const env = {
  isDev: import.meta.env.VITE_DEV_MODE === 'true',
  useEmulator: import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'fake-api-key',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fake-auth-domain',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'humanv1-emulator',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'fake-bucket',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '00000000',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:00000:web:0000',
  },
  emulator: {
    authHost: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST || 'localhost:9099',
    firestoreHost: import.meta.env.VITE_FIREBASE_FIRESTORE_EMULATOR_HOST || 'localhost:8080',
  }
};
