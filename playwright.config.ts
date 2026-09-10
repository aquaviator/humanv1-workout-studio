import { defineConfig } from '@playwright/test';

const demoProject = 'demo-humanv1-workout-studio';
if (!demoProject.startsWith('demo-')) throw new Error('Browser acceptance must use a demo Firebase project');

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  globalSetup: './e2e/global-setup.ts',
  outputDir: 'test-results',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node scripts/start-browser-emulators.mjs',
      port: 8081,
      reuseExistingServer: false,
      timeout: 90_000,
    },
    {
      command: 'npx cross-env VITE_USE_FIREBASE_EMULATOR=true VITE_FIREBASE_PROJECT_ID=demo-humanv1-workout-studio VITE_FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9098 VITE_FIREBASE_FIRESTORE_EMULATOR_HOST=127.0.0.1:8081 VITE_FIREBASE_TEST_EMAIL=browser-owner@example.test VITE_FIREBASE_TEST_PASSWORD=browser-password-123 vite --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
