/// <reference types="vitest" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createHash} from 'node:crypto';
import {readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {defineConfig, loadEnv} from 'vite';

const contentFiles = (entry: string): string[] => statSync(entry).isDirectory()
  ? readdirSync(entry).sort().flatMap(name => contentFiles(path.join(entry, name)))
  : [entry];

export const buildContentId = () => {
  const hash = createHash('sha256');
  for (const file of ['index.html', 'package-lock.json', 'public', 'src'].flatMap(contentFiles).sort()) {
    hash.update(file.replaceAll('\\', '/'));
    hash.update(readFileSync(file));
  }
  return hash.digest('hex').slice(0, 16);
};

export default defineConfig(({ command, mode }) => {
  const contentId = buildContentId();
  if (command === 'build') {
    const buildEnv = loadEnv(mode, process.cwd(), '');
    const required = ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID'];
    const missing = required.filter(name => !buildEnv[name]?.trim());
    if (missing.length) throw new Error(`Production build requires approved Firebase web configuration: ${missing.join(', ')}`);
    if (buildEnv.VITE_USE_FIREBASE_EMULATOR !== 'false') throw new Error('Production build requires VITE_USE_FIREBASE_EMULATOR=false');
    if (buildEnv.VITE_DEV_MODE !== 'false') throw new Error('Production build requires VITE_DEV_MODE=false');
  }
  return {
    plugins: [react(), tailwindcss(), {
      name: 'humanv1-service-worker-version',
      closeBundle() {
        if (command !== 'build') return;
        const serviceWorker = path.resolve('dist/service-worker.js');
        const source = readFileSync(serviceWorker, 'utf8');
        if (!source.includes('__HV1_BUILD_ID__')) throw new Error('Service worker build identity placeholder is missing');
        writeFileSync(serviceWorker, source.replaceAll('__HV1_BUILD_ID__', contentId));
      },
    }],
    define: { __HV1_BUILD_ID__: JSON.stringify(contentId) },
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
      exclude: ['e2e/**', 'node_modules/**'],
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
