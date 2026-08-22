export const env = {
  isDev: import.meta.env.VITE_DEV_MODE === 'true',
  useEmulator: import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true',
  firebase: {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'fake-api-key',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fake-auth-domain',
    projectId: import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' ? 'demo-humanv1-workout-studio' : (import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-humanv1-workout-studio'),
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'fake-bucket',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '00000000',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:00000:web:0000',
  },
  emulator: {
    authHost: '127.0.0.1:9098',
    firestoreHost: '127.0.0.1:8081',
  }
};
