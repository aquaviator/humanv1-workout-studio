import { CANONICAL_PLAN_SCHEMA, CANONICAL_WORKOUT_SCHEMA, canonicalChecksum, CanonicalDiscipline, CanonicalPlan, CanonicalWorkout, ExecutionStructure } from "../domain/canonical";

const NOW = "2026-09-14T00:00:00.000Z";
type FixtureSpec = [id: string, title: string, discipline: CanonicalDiscipline, structure: ExecutionStructure, metric: "reps" | "duration" | "distance"];
const specs: FixtureSpec[] = [
  ["demo_strength_push", "Push", "STRENGTH", "STRAIGHT_SETS", "reps"], ["demo_strength_pull", "Pull", "STRENGTH", "STRAIGHT_SETS", "reps"],
  ["demo_strength_legs", "Legs", "STRENGTH", "SUPERSET", "reps"], ["demo_strength_full_body", "Full Body", "STRENGTH", "CIRCUIT", "reps"],
  ["demo_strength_upper_lower", "Upper/Lower Example Week", "STRENGTH", "STRAIGHT_SETS", "reps"],
  ["demo_run_easy", "Easy Run", "RUNNING", "DISTANCE", "distance"], ["demo_run_tempo", "Tempo Run", "RUNNING", "INTERVAL", "duration"],
  ["demo_run_intervals", "Interval Run", "RUNNING", "INTERVAL", "duration"], ["demo_run_long", "Long Run", "RUNNING", "DISTANCE", "distance"],
  ["demo_run_walk", "Run/Walk", "RUNNING", "RUN_WALK", "duration"],
  ["demo_cycle_endurance", "Endurance Ride", "CYCLING", "DISTANCE", "duration"], ["demo_cycle_tempo", "Tempo Ride", "CYCLING", "CYCLING_INTERVAL", "duration"],
  ["demo_cycle_threshold", "Threshold Intervals", "CYCLING", "CYCLING_INTERVAL", "duration"],
  ["demo_swim_technique", "Technique Swim", "SWIMMING", "SWIM_INTERVAL", "distance"], ["demo_swim_aerobic", "Aerobic Swim", "SWIMMING", "DISTANCE", "distance"],
  ["demo_swim_css", "CSS Intervals", "SWIMMING", "SWIM_INTERVAL", "distance"],
  ["demo_brick_short", "Short Brick", "MULTISPORT", "BRICK", "duration"], ["demo_brick_progressive", "Progressive Brick", "MULTISPORT", "BRICK", "duration"],
  ["demo_timed_tabata", "Tabata-style Example", "HYROX", "INTERVAL", "duration"], ["demo_timed_emom", "EMOM Example", "HYROX", "EMOM", "duration"],
  ["demo_timed_amrap", "AMRAP Example", "HYROX", "AMRAP", "duration"],
];

function fixtureWorkout([id, title, discipline, structure, metric]: FixtureSpec): CanonicalWorkout {
  const set = { setId: `${id}_set_01`, order: 1, ...(metric === "reps" ? { repetitions: { minimum: 8, maximum: 10 }, restAfterSeconds: 90 } : metric === "distance" ? { distanceMetres: discipline === "SWIMMING" ? 400 : 5000, intensity: { scale: "RPE" as const, target: "easy" } } : { durationSeconds: 600, intensity: { scale: "RPE" as const, target: "controlled" } }) };
  const value: CanonicalWorkout = {
    schemaVersion: CANONICAL_WORKOUT_SCHEMA, workoutGlobalId: id, publicationVersionId: `${id}_v1`, revision: 1, checksum: "", owner: null,
    provenance: { contentClass: "GOVERNED_LIBRARY", originApplication: "WORKOUT_STUDIO", fixtureClassification: "DEMO_FIXTURE" }, discipline,
    workoutType: structure, title, description: "Demonstration fixture for contract verification; not individualized medical guidance.",
    blocks: [{ blockId: `${id}_block_01`, order: 1, structure, rounds: structure === "CIRCUIT" ? 3 : undefined, timeCapSeconds: structure === "AMRAP" ? 1200 : undefined,
      placements: [{ placementId: `${id}_placement_01`, order: 1, exerciseReference: { kind: "GOVERNED", exerciseId: `${id}_movement`, releaseId: "demo_catalogue_v1" }, sets: [set], equipment: [] }] }],
    estimatedDuration: { seconds: metric === "duration" ? 600 : 1800, provenance: "CALCULATED" }, validationStatus: "VALID", createdAt: NOW, updatedAt: NOW,
    tombstoneState: "ACTIVE", publicationEligibility: "ELIGIBLE",
  };
  value.checksum = canonicalChecksum(value); return value;
}
export const canonicalWorkoutFixtures = specs.map(fixtureWorkout);

function fixturePlan(id: string, title: string, workoutIds: string[], durationWeeks: number): CanonicalPlan {
  const weeks = Array.from({ length: durationWeeks }, (_, index) => ({ weekId: `${id}_week_${index + 1}`, order: index + 1, recoveryWeek: durationWeeks > 1 && index === durationWeeks - 1,
    placements: workoutIds.map((workoutId, order) => ({ placementId: `${id}_w${index + 1}_p${order + 1}`, order: order + 1, daySlot: order + 1, workoutVersionId: `${workoutId}_v1`, required: order === 0, priority: order === 0, adaptation: order === 0 ? "FIXED" as const : "OPTIONAL" as const })) }));
  const value: CanonicalPlan = { schemaVersion: CANONICAL_PLAN_SCHEMA, planGlobalId: id, publicationVersionId: `${id}_v1`, revision: 1, checksum: "", owner: null,
    provenance: { contentClass: "GOVERNED_LIBRARY", originApplication: "WORKOUT_STUDIO", fixtureClassification: "DEMO_FIXTURE" }, title, goal: "Demonstrate canonical scheduling", athleteLevel: "ALL", durationWeeks,
    timezone: "Europe/London", startDate: "2026-09-14", phases: [{ phaseId: `${id}_phase_1`, order: 1, title: "Foundation", cycleIds: [`${id}_cycle_1`] }],
    cycles: [{ cycleId: `${id}_cycle_1`, order: 1, title: "Demonstration", weekIds: weeks.map(week => week.weekId) }], weeks, publicationEligibility: "ELIGIBLE",
    validationStatus: "VALID", createdAt: NOW, updatedAt: NOW, tombstoneState: "ACTIVE" };
  value.checksum = canonicalChecksum(value); return value;
}
export const canonicalPlanFixtures = [
  fixturePlan("demo_plan_strength_week", "One-week Strength Example", ["demo_strength_push", "demo_strength_pull", "demo_strength_legs"], 1),
  fixturePlan("demo_plan_running_4w", "Four-week Running Example", ["demo_run_easy", "demo_run_tempo", "demo_run_intervals", "demo_run_long"], 4),
  fixturePlan("demo_plan_multisport_4w", "Four-week Multisport Example", ["demo_cycle_endurance", "demo_swim_technique", "demo_brick_progressive"], 4),
];
export const canonicalFixtureManifest = {
  schemaVersion: "humanv1.fixture-manifest/1", classification: "DEMO_FIXTURE", workoutCount: canonicalWorkoutFixtures.length, planCount: canonicalPlanFixtures.length,
  workoutChecksums: Object.fromEntries(canonicalWorkoutFixtures.map(item => [item.workoutGlobalId, item.checksum])),
  planChecksums: Object.fromEntries(canonicalPlanFixtures.map(item => [item.planGlobalId, item.checksum])),
};
