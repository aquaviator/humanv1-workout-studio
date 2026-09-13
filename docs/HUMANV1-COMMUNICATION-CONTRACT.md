# HumanV1 Studio ↔ Human Strength communication contract

This document is the drift-prevention contract for owner-scoped communication. The canonical production project is `hv1-platform`. Every user document is below `users/{humanUserId}`; Firebase UID is used only to prove the immutable UID ↔ Human ID ownership link. Cross-owner access fails closed. Epoch fields used by Android are integer milliseconds (or integer epoch days where named); Studio publication timestamps are ISO-8601 UTC strings.

## Entity matrix

| Entity/path | Canonical collection | Android source | Studio source | Identity, revision and references | Direction | Idempotency / acknowledgement | Status |
|---|---|---|---|---|---|---|---|
| Private exercise | `customExercises` | custom exercise entity / sync command | `CrossAppRepository`, `PrivateExercise` | document/global ID; Android local `custom_*` may differ; `humanUserId`; integer revision; soft-delete `deletedAt` | Both | document ID + monotonic revision; no device-delivery acknowledgement; durable pending write | Supported |
| Governed exercise catalogue | release-scoped catalogue collections | bundled/released catalogue reader | `FirebaseCatalogueRepository` | governed ID and release pointer; never owner-private | Read-only into both | release/checksum governance; no client writes | Supported, read-only |
| Editable workout/routine | `templates` | template entity | `CrossAppRepository`, `Workout` | `globalId`, owner, integer revision; children by `templateGlobalId`; tombstone only | Both | stable parent ID + revision; three-way conflict record | Supported |
| Workout exercise placement | `templateExercises` | template exercise entity | `ExerciseBlock` | stable child `globalId`; `templateGlobalId`; exercise ID; zero-based position; owner/revision | Both | stable child ID + revision; parent must remain owner-scoped | Supported |
| Workout set prescription | `templateSets` | template set entity | `Effort` / `MetricPrescription` | stable set `globalId`; `templateExerciseGlobalId`; one-based position; owner/revision | Both | stable child ID + revision | Supported with metric limits below |
| Immutable workout version | `publishedWorkouts` | `StudioWorkoutIngestion` | `PublicationRepository` | `{globalId}_r{revision}_{checksum-prefix}`; ISO timestamps; immutable ACTIVE/tombstone envelope | Studio → App | content checksum makes resend idempotent; exact `workoutDeliveryAcks` required | Supported in v38 and v39 |
| Workout delivery acknowledgement | `workoutDeliveryAcks` | `StudioWorkoutIngestion` writer | `DeliveryAcknowledgementRepository` | owner, global/version ID, checksum, source revision, `HUMAN_STRENGTH`, immutable | App → Studio | wrong owner/version/checksum/revision is ignored or denied | Supported in v38 and v39 |
| Editable plan | `trainingPlans` | planner plan entity | `CrossAppRepository`, `Plan` | stable plan `globalId`; owner; integer revision; template reference; soft delete | Both | stable ID + revision; durable pending/conflict | Supported as editable projection |
| Planned occurrence | `plannedWorkouts` | planned workout entity | `PlanPlacement` | stable placement/global ID; `seriesId`; `templateGlobalId`; epoch day; owner/revision; soft delete | Both | stable placement ID + revision | Supported |
| Immutable plan version | `publishedPlans` | `StudioPlanIngestion` | `PublicationRepository` | checksum-derived immutable ID; owner, destination, timezone and sorted exact workout-version set | Studio → App | unchanged checksum reuses the version; executable projection is validated before apply | Supported in v40 source |
| Plan delivery acknowledgement | `planDeliveryAcks` | `StudioPlanIngestion` writer | exact acknowledgement reader | owner, plan global/version ID, checksum, source revision, dependency set, `HUMAN_STRENGTH`, immutable | App → Studio | emitted only after transactional local reconstruction; wrong/malformed acknowledgements never confirm | Supported in v40 source |
| Drafts | `workoutDrafts`, `planDrafts`, `protocolDrafts` | not an ingestion contract | `DraftRepository` / `SyncManager` | stable global ID, owner, revision, ISO timestamps, soft delete | Studio cloud sync | owner/revision transaction; durable IndexedDB queue | Supported, Studio-only |
| Sessions / logged sets | `sessions`, `loggedSets`, `measurementRecords` | completed history entities | reconstruction/read surfaces only | stable owner-scoped history and parent IDs | App → Studio read-only where exposed | never converted into drafts, commands or repair writes | Deliberately read-only |
| Profile/settings | `profile`; account entitlement under `accounts/{uid}` | profile hydration / `SettingsUpdated` command | auth, profile and entitlement repositories | immutable ownership link; server-backed entitlement receipt | Read/hydration | semantically unchanged settings must emit no command | Supported; guarded by tests |
| Commands/conflicts | `processedCommands`; local IndexedDB pending/conflict records | sync engine command log | `SyncManager` / `CrossAppRepository` | stable command/entity IDs, owner, revision | Both where implemented | replay same key; never recreate poisoned command; terminal conflicts fail closed | Supported per entity |

## Metric mapping

| Meaning | Studio metric | Android template field | Null semantics | Status |
|---|---|---|---|---|
| Repetitions | `repetitions` (legacy fixtures may say `repetition_count`) | `targetRepsMin`, `targetRepsMax` | both null means unspecified | Supported; naming normalization remains a compatibility concern |
| External load | `external_load`, kg | `targetWeight` | null means unspecified | Supported |
| Duration | `duration`, seconds | `targetDurationSeconds` | null means unspecified | Supported |
| Distance | `distance`, metres | `targetDistance` | null means unspecified | Supported |
| Rest | `Effort.restAfterSeconds` | placement `restSeconds` | missing maps to the documented 90-second editable default | Supported, lossy per-effort |
| Laterality/side | no canonical template field | none | absence means unspecified, never guessed | Deferred |
| Notes | block/effort notes | placement/set notes | null/empty means absent | Supported |
| Ordering | block order / prescription position | placement zero-based / set one-based position | required stable ordering | Supported |
| Superset/circuit | nested Studio blocks | flattened template placements | grouping is not preserved in the Android projection | Defective/lossy; immutable workout retains truth |
| Cardio combinations | duration + distance + optional load/reps | corresponding nullable fields | only supplied metrics are mapped | Supported |
| RPE / tempo | `rpe`, `tempo` | `targetRpe`, `tempo` | null means unspecified | Studio → App projection supported; App → Studio reconstruction currently omits them |

## Delivery states and failure policy

`QUEUED_OFFLINE → SENDING → SENT_TO_HUMANV1 → WAITING_FOR_HUMANV1` describes durable local queue, cloud presence and the app boundary. Only an exact immutable acknowledgement may produce `AVAILABLE_IN_HUMANV1`. `PARTIALLY_DELIVERED`, `CONFLICT`, and `RETRY_REQUIRED` remain truthful persistent outcomes. Parent/child partial failure reuses checksum-derived workout versions and deterministic plan/placement IDs on retry.

Tombstones preserve history and never hard-delete client records. Missing/archived parents add reconstruction diagnostics and block publication; they are never fabricated. Private exercises never enter governed catalogue collections. Completed sessions remain history and never become editable drafts.

## Version compatibility

- Human Strength v40 ingests immutable `publishedWorkouts` and emits exact `workoutDeliveryAcks`.
- The next v40 source revision ingests immutable `publishedPlans`, reconstructs owner-scoped executable plans and occurrences, and emits governed exact `planDeliveryAcks` after successful validation and storage.
- Schema additions must be optional for older readers, preserve existing IDs/revisions, add rules and isolated bidirectional contract tests, and never reinterpret null as a fabricated value.

## Adding HUMAN_HIIT later

Define a separate destination capability and acknowledgement schema first. Add collection rules and emulator denial tests, then a destination-specific adapter and exact version/checksum acknowledgement matcher. Keep `HUMAN_STRENGTH` tags, queues, acknowledgements and UI states isolated; never treat a HIIT acknowledgement as Strength delivery. No HUMAN_HIIT production behavior is enabled by this document.

## Future third-party export boundary

Protocol Designer remains the governed authoring source. A versioned, destination-neutral export IR may be derived from a protocol version, but may never replace or mutate it. Each future adapter must declare supported nodes, metrics, units, nesting, cues and degradation rules, and classify an export as **Faithful**, **Approximated**, or **Unsupported**. Approximation requires an exact preview and explicit acknowledgement; unsupported content is blocked, never silently stripped. Generated files carry their checksum, source protocol/version, adapter version and destination metadata. File generation/download is not proof of import, and connected services require exact remote acknowledgement. Completed-activity import is a separate boundary from planned-workout export, and HumanV1/Human Strength delivery remains isolated from every third-party destination.

Before implementation, vendor APIs and file formats must be reverified from current official primary sources. Community or reverse-engineered specifications are not authoritative. Apple reverse-engineered workout protobuf generation and Garmin FIT SDK redistribution require separate legal/security/product decisions. No direct Garmin, Wahoo, Zwift, ROUVY, TrainingPeaks, Intervals.icu, Apple, or HUMAN_HIIT delivery is claimed here.

## Evidence

Studio: `CrossAppRepository.test.ts`, `PublicationRepository.test.ts`, `DeliveryAcknowledgementRepository.test.ts`, `SyncManager.test.ts`, `PlanDeliveryRepository.test.ts`, `PlanSend.test.tsx`, `EmulatorAcceptance.test.ts`, and `Rules.test.ts`. Android: `StudioWorkoutIngestion` and its JVM tests, profile hydration idempotency tests, planner backup/reconstruction tests, and the Strength Firestore rules suite.
