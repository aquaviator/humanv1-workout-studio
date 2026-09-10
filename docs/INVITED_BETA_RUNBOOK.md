# Workout Studio invited-beta runbook

This runbook is an operational checklist, not a claim of legal compliance or release approval. Human Strength is the only governed delivery destination today; Human HIIT acknowledgement is deferred.

## Local Studio and isolated acceptance

1. Install the repository's pinned Node dependencies and use Java 21 for Firebase emulators.
2. Copy the environment template to a gitignored local file. Supply only the public Firebase web configuration. Never commit credentials, service accounts, CLI state, production data, or real user identities.
3. For automated acceptance, require `VITE_USE_FIREBASE_EMULATOR=true`, an isolated `demo-*` project ID, Auth and Firestore emulator endpoints, synthetic owners, and disposable ports. Abort if any configuration names `hv1-platform`.
4. Run the documented browser-acceptance command, then the serialized emulator suite, non-emulator suite, TypeScript, production build, bundle-isolation scan, accessibility checks, skip/bypass scan, and `git diff --check`.
5. Keep browser profiles, screenshots, traces, emulator exports, logs, caches, and generated bundles out of Git. A failed run must release its ports and preserve redacted evidence.

Required connectors are Firebase Auth and Firestore. Local acceptance uses emulators only. Deployment uses the existing authenticated Firebase CLI session and public production web configuration; no administrator credential belongs in the browser or repository.

## Hosting release, approval, and rollback

Preview deployment requires explicit authorization, a clean reviewed commit, passing release gates, the `hv1-platform` project specified on every supported command, target `workout-studio`, and a finite expiry. Verify routes, assets, signed-out fail-closed behavior, and absence of demo/emulator endpoints.

Live Hosting requires separate explicit approval after preview acceptance. Record the deployed commit and Hosting release. Roll back by selecting the last accepted Hosting release in Firebase Hosting release history; do not deploy Firestore rules, indexes, Functions, Auth, App Check, IAM, or DNS as part of a Hosting rollback.

## Google Play internal release, approval, and rollback

Before upload, verify package `com.aistudio.humanstrength.kfqjza`, a unique version code greater than 38, non-debuggable release manifest, configured upload signing identity, Play signing certificate, AAB SHA-256, production-isolation scan, and all Strength release gates. Upload and promotion require explicit user authorization and Play Console access; never create or expose a signing key.

Publish first to the internal-testing track, review Play's artifact and signing summaries, then invite only approved testers. Halt rollout for data loss, identity mismatch, false entitlement state, migration failure, or delivery duplication. Roll back operationally by halting the release and issuing a corrected higher-version build; Android version codes cannot be reused.

## Physical in-place update acceptance — checklist only

For Samsung SM-S908B, serial `R3CT90A56BE`:

- Install only the Play-delivered in-place update; no sideload, uninstall, data clear, or backup replacement.
- Confirm version code is greater than 38 and Play signing certificate is expected.
- Confirm local data and the authenticated account survive.
- Confirm the server-backed support projection is accepted through `2026-09-16T09:56:40Z`; the introductory trial remains expired; no paid or restarted-trial claim appears.
- Confirm hydration emits no `SettingsUpdated` command.
- Confirm session `session_6ff465bfbf37` remains revision 1, `SYNCED`, with correct Human ownership, and its related logged set is unchanged.
- Confirm `TEST ANDY` exists exactly once. Run **Check now** twice and confirm the second run is idempotent.

## Final production delivery loop — checklist only

This step requires separate authorization for narrowly scoped production writes.

1. Create one uniquely named disposable acceptance workout with one governed Strength exercise and one owner-private exercise.
2. Publish once. Confirm Studio says sent to HumanV1 but not available in an app before acknowledgement.
3. Trigger one Human Strength download. Confirm the exact owner/workout/version/checksum acknowledgement and Studio's available state.
4. Restart both clients and repeat synchronization; confirm no duplicates.
5. Make one meaningful edit, publish revision 2, retain immutable revision 1, and prove the revision-1 acknowledgement does not satisfy revision 2.
6. Download once and confirm the exact revision-2 acknowledgement.

## Historical plan issue

Plan `plan_73584f7d32644da293bae765c66c160f` has 22 stable placements referring to archived `template_legs`. Studio preserves and exposes each placement, collapses the repeated parent warning, distinguishes historical from future/unscheduled occurrences, and blocks publication. Any replacement or removal must first be reviewed as a deterministic dry run and then explicitly authorized. Do not fabricate an immutable version or silently repair production data.

## Monitoring and support triage

For stuck delivery, record the owner-safe workout ID, immutable version, checksum, queue state, last transition, connectivity, retry count, and exact Human Strength acknowledgement. Distinguish local queueing, cloud confirmation, and app acknowledgement. Use only the governed retry path; never edit status fields ad hoc or claim delivery from cloud confirmation alone.

For **Access verification unavailable**, confirm connectivity, authenticated Human identity, server-backed entitlement projection, cache freshness, expiry, and reconnect behavior. Do not infer access from browser time or local storage, grant access, restart a trial, or expose entitlement records. Escalate with redacted timestamps and correlation IDs.

Privacy boundaries: access only the authorized owner's minimum necessary records; never log workout content, tokens, email addresses, entitlement documents, or other users' data. Define and approve retention/deletion handling before beta; this runbook does not create that policy.

## Invited-beta go/no-go

Go to external acceptance only when local Studio browser/emulator gates and Strength release gates pass, reviewed commits are pushed, a verified AAB is ready, and rollback owners are named. Invited-beta readiness additionally requires the Play in-place update and final real acknowledgement loop to pass.

The business owner must provide and approve a privacy policy, terms, support contact and response route, retention/deletion policy, tester list and consent wording, store listing, screenshots/content rating/data-safety answers, monitoring ownership, and incident/rollback decision maker. Engineering evidence does not constitute legal approval.

External actions, in order: review and manually push both repositories; authorize and upload the verified AAB to Play internal testing; complete the physical in-place acceptance; separately authorize the scoped production loop; complete exact acknowledgement acceptance; approve the invited-beta go/no-go; authorize any live Hosting release separately.
