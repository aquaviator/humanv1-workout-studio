# Isolated browser acceptance

The delivery browser journey runs only against Firebase Auth and Firestore emulators using the hard-coded `demo-humanv1-workout-studio` project. It serializes reset and test execution, creates a synthetic owner, and uses a persistent Chromium profile to exercise IndexedDB restoration.

Prerequisites are Node.js, the locked npm dependencies, Playwright Chromium (`npx playwright install chromium`), and Java 21 for Firebase emulators. No production Firebase configuration is read.

Run the complete journey with:

```powershell
npm run test:browser
```

The runner owns both emulator ports and the Vite port, refuses a non-loopback Firestore emulator, runs one worker, and releases its child processes when complete. Failures retain a Playwright trace, screenshot, video, and redacted browser-console evidence under ignored `test-results/`. Reports and the persistent test profile are also ignored.

The journey covers cancellation, keyboard focus, immutable online publication, truthful cloud-only state, real browser offline queuing, complete Chromium process restart while offline, automatic single replay, exact Human Strength acknowledgement, fail-closed acknowledgement variants, notification persistence, mobile overflow, and serious/critical axe findings. It also pauses an emulator publication immediately after its durable `SENDING` transition, disconnects the genuine browser network, and proves retry state, another offline process restart, and exactly-once completion after reconnect.

The versioned service worker caches only same-origin application-shell documents, scripts, styles, fonts, and images. It never handles Firebase/API requests or non-GET requests. Firestore's durable local cache supplies previously verified identity and entitlement documents; repository-owned IndexedDB supplies publication queues and delivery receipts. The send-pause hook is behind Vite's compile-time emulator flag and the production isolation gate rejects its symbol.
