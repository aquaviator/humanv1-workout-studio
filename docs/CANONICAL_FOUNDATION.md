# HumanV1 canonical workout and plan foundation

The shared contract lives in `contracts/canonical-contract.json`; its TypeScript implementation is in `src/domain/canonical.ts`, and the matching Android implementation is in `com.example.canonical`. Both consumers use workout schema `humanv1.canonical-workout/1` and plan schema `humanv1.canonical-plan/1`.

Canonical workouts preserve owner, provenance, immutable publication versions, ordered stable block/placement/set identities, discipline-appropriate prescriptions, validation state, tombstones, publication eligibility, and migration metadata. Canonical plans preserve timezone/date intent, phases, cycles, weeks, stable placements, immutable workout-version dependencies, recurrence, priority/optional sessions, recovery weeks, deterministic occurrence identity, and exact application acknowledgement.

Governed library versions are immutable. A customer can clone a version into user-owned editable content. Later library releases provide four explicit choices: **Keep my version**, **Review library update**, **Create updated copy**, or **Replace future uncompleted schedule only**. Completed, skipped, and detached occurrences are never replaced.

The 21 workout and 3 plan fixtures are deterministic demonstrations, marked `DEMO_FIXTURE`, and are not individualized medical guidance. They validate strength, running, cycling, swimming, multisport, and timed-protocol execution without coercing every discipline into repetitions.

Incomplete records expose exact validator issues and the customer label **Needs your input**. No validator or normalizer invents blocks, exercises, sets, repetitions, loads, rest, tempo, duration, dates, ownership, progression, or intent.
