# Development and release workflow

## 1. Preflight

Confirm the current branch, HEAD, working tree, Node and Firebase CLI versions, and an existing Java 21 runtime. Read `firebase.json`, `.firebaserc`, Hosting target configuration, and local environment variable names. Never infer a Firebase project, Hosting site, custom domain, or production web configuration.

Use the locked dependencies already installed. Run `npm ci` only when `node_modules` is genuinely absent or invalid.

## 2. Implementation loop

Trace the complete user journey before editing. Treat domain schemas, stable IDs, checksums, immutable versions, ownership, offline state, Firestore paths, and UI status text as one contract. Implement necessary rules and migrations with the feature and preserve compatible stored data.

Run focused TypeScript and test commands throughout implementation. Expected offline failures may be warnings; ownership, permission, identity, corrupt-payload, and unexpected terminal failures remain errors. Logs must contain only privacy-safe codes and must never include credentials, email addresses, complete envelopes, or private content.

## 3. Emulator proof

Cloud behaviour changes require the repository-configured Auth and Firestore emulators. Use only the ports in `firebase.json` and a `demo-` project ID. Check that the ports are free and stop only processes started by the current run.

On Windows, set `JAVA_HOME` to an existing Java 21 runtime and prepend its `bin` directory for the current process. If Java NIO reports `Unable to establish loopback connection`, use a short, task-owned `TEMP` and `TMP` path for that process; do not install another runtime or change system-wide configuration.

Run the focused rules and emulator acceptance files. No publication test may be skipped. Prove trusted-owner access, cross-owner denial, immutable versions and hard-delete denial, schema enforcement, protected governed collections, idempotent and edited publication, offline queue persistence, reconnect replay, remote acknowledgement, typed conflicts and retries, deterministic Protocol compilation, and retry-safe exact Plan dependencies.

## 4. Release boundary

After focused emulator proof is green, run in this order:

1. `npx tsc --noEmit`
2. The complete repository test suite with emulators
3. A production build with approved production Firebase web variables and `VITE_USE_FIREBASE_EMULATOR=false`
4. A recursive isolation scan of generated bundles
5. `git diff --check`

The bundle scan must reject emulator hosts and ports, demo project IDs, synthetic users and fixtures, debug App Check values, service-account material, credentials or tokens, development identity bypasses, and private workout payloads. Report size warnings separately.

Do not substitute demo or invented values when production web configuration is missing. Record the exact missing variable names and leave the production build or preview as TODO.

## 5. Hosting preview

Proceed only when the repository unambiguously supplies the authoritative Firebase project and Hosting site/target, the Firebase CLI is already authenticated with the required role, approved production web configuration is available locally, all release gates pass, and emulator mode is disabled.

Deploy only a named, finite-expiry preview channel. Never deploy the live channel, Firestore rules or indexes as part of this step. Do not create infrastructure, configure a custom domain, change Authentication providers, access production user data, or perform an authenticated production publication.

Open the preview URL and verify the shell, routes, static assets, signed-out fail-closed state, network destinations, and browser console. Confirm that no emulator or demo endpoint is requested.

## 6. Handoff

Remove emulator logs, generated caches, temporary diagnostics, and ungoverned build output. Commit coherent source, tests, rules, configuration, and documentation locally. Do not commit real `.env` files, CLI login state, service accounts, or secrets, and do not push without explicit authorization.

Return one concise Done/TODO receipt with test totals, build and bundle-scan results, preview details or the exact blocker, production-access declarations, commit hash, clean/dirty state, and the manual push command.
