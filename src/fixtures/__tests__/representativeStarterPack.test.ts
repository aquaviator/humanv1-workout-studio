import { describe, expect, it } from "vitest";
import { registeredPackId, starterPackChecksum, validateRegisteredStarterPack } from "../../domain/starterPack";
import { representativeStarterPack, registeredStarterPacks } from "../representativeStarterPack";
import { representativeWorkoutManifest } from "../representativeWorkoutManifest";

const references = () => representativeWorkoutManifest.workouts.flatMap(workout => workout.blocks.flatMap(block =>
  block.type === "EXERCISE" ? [block.exerciseId] : block.type === "SUPERSET" || block.type === "CIRCUIT" ? block.exercises.map(item => item.exerciseId) : []));

describe("registered representative starter pack", () => {
  it("uses the approved governed squat identity and contains no obsolete reference", () => {
    expect(references()).toContain("squat");
    expect(references()).not.toContain("barbell_squat");
    expect(new Set(references())).toEqual(new Set(["squat", "bench_press", "barbell_row", "plank", "farmers_carry", "romanian_deadlift", "overhead_press", "assisted_pull_up", "bulgarian_split_squat", "outdoor_walk", "outdoor_run", "stationary_bike", "worlds_greatest_stretch", "open_book_stretch", "wall_angels"]));
  });
  it("is registered, checksummed and references every workout from a ten-week relative plan", () => {
    expect(registeredStarterPacks.get(representativeStarterPack.packId)).toBe(representativeStarterPack);
    expect(starterPackChecksum(representativeStarterPack)).toBe(representativeStarterPack.contentChecksum);
    expect(representativeStarterPack.planManifest?.weeks).toHaveLength(10);
    const workoutKeys = new Set(representativeWorkoutManifest.workouts.map(item => item.semanticKey));
    for (const placement of representativeStarterPack.planManifest!.weeks.flatMap(week => week.placements)) expect(workoutKeys.has(placement.workoutSemanticKey)).toBe(true);
  });
  it("fails checksum verification after any silent content change", () => {
    const changed = { ...representativeStarterPack, description: "changed" };
    expect(starterPackChecksum(changed)).not.toBe(representativeStarterPack.contentChecksum);
  });
  it("rejects duplicate workout and nested semantic keys", () => {
    const duplicateWorkout = { ...representativeStarterPack, workoutManifest: { ...representativeStarterPack.workoutManifest, workouts: [representativeStarterPack.workoutManifest.workouts[0], representativeStarterPack.workoutManifest.workouts[0]] } };
    expect(() => validateRegisteredStarterPack(duplicateWorkout)).toThrow("DUPLICATE_WORKOUT_SEMANTIC_KEY");
    const workout = representativeStarterPack.workoutManifest.workouts[0];
    const duplicateBlock = { ...workout, blocks: [workout.blocks[0], workout.blocks[0]] };
    const nested = { ...representativeStarterPack, workoutManifest: { ...representativeStarterPack.workoutManifest, workouts: [duplicateBlock, ...representativeStarterPack.workoutManifest.workouts.slice(1)] } };
    expect(() => validateRegisteredStarterPack(nested)).toThrow("DUPLICATE_NESTED_SEMANTIC_KEY");
  });
  it("includes namespace and dataset version in pack idempotency", () => {
    expect(registeredPackId(representativeStarterPack.workoutManifest.operationNamespace)).toBe(representativeStarterPack.packId);
    const v2 = starterPackChecksum({ ...representativeStarterPack, datasetVersion: "2.0", contentChecksum: undefined as never });
    expect(v2).not.toBe(representativeStarterPack.contentChecksum);
  });
});
