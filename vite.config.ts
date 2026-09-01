/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    const buildEnv = loadEnv(mode, process.cwd(), '');
    const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID'];
    const missing = required.filter(name => !buildEnv[name]?.trim());
    if (missing.length) throw new Error(`Production build requires approved Firebase web configuration: ${missing.join(', ')}`);
    if (buildEnv.VITE_USE_FIREBASE_EMULATOR !== 'false') throw new Error('Production build requires VITE_USE_FIREBASE_EMULATOR=false');
    if (buildEnv.VITE_DEV_MODE !== 'false') throw new Error('Production build requires VITE_DEV_MODE=false');
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test/setup.ts',
      fileParallelism: false,
      pool: 'threads',
      maxWorkers: 1,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
