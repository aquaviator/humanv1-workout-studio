import { describe, expect, it } from "vitest";
import { canonicalChecksum, cloneLibraryWorkout, deterministicOccurrenceId, replaceFutureScheduleOnly, validateCanonicalPlan, validateCanonicalWorkout } from "../canonical";
import { canonicalFixtureManifest, canonicalPlanFixtures, canonicalWorkoutFixtures } from "../../fixtures/canonicalFixtures";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import checkedManifest from "../../fixtures/canonical-fixture-manifest.json";

describe("canonical workout and plan contract", () => {
  it("validates all discipline-specific demo structures", () => {
    expect(canonicalWorkoutFixtures).toHaveLength(21); expect(canonicalWorkoutFixtures.flatMap(validateCanonicalWorkout)).toEqual([]);
    expect([...new Set(canonicalWorkoutFixtures.map(item => item.blocks[0].structure))]).toEqual(expect.arrayContaining([
      "STRAIGHT_SETS", "SUPERSET", "CIRCUIT", "INTERVAL", "AMRAP", "EMOM", "DISTANCE", "RUN_WALK", "CYCLING_INTERVAL", "SWIM_INTERVAL", "BRICK",
    ]));
    expect(new Set(canonicalWorkoutFixtures.map(item => item.discipline))).toEqual(new Set(["STRENGTH", "RUNNING", "CYCLING", "SWIMMING", "MULTISPORT", "HYROX"]));
  });
  it("validates one-week and four-week canonical plans", () => { expect(canonicalPlanFixtures).toHaveLength(3); expect(canonicalPlanFixtures.flatMap(validateCanonicalPlan)).toEqual([]); });
  it("uses stable key-order-independent checksums", () => { expect(canonicalChecksum({ b: 2, a: 1 })).toBe(canonicalChecksum({ a: 1, b: 2 })); expect(canonicalChecksum({ a: 1 })).toHaveLength(64); });
  it("uses deterministic occurrence IDs", () => { expect(deterministicOccurrenceId("plan_v1", "placement_1", 21000)).toBe(deterministicOccurrenceId("plan_v1", "placement_1", 21000)); expect(deterministicOccurrenceId("plan_v1", "placement_1", 21000)).not.toBe(deterministicOccurrenceId("plan_v1", "placement_1", 21001)); });
  it("clones an immutable library version without changing its source", () => { const source = structuredClone(canonicalWorkoutFixtures[0]); const clone = cloneLibraryWorkout(source, { humanUserId: "human_fixture" }, "2026-09-15T00:00:00.000Z"); expect(source).toEqual(canonicalWorkoutFixtures[0]); expect(clone).toMatchObject({ owner: { humanUserId: "human_fixture" }, revision: 1, provenance: { contentClass: "USER_AUTHORED", sourceId: source.publicationVersionId } }); expect(clone.workoutGlobalId).not.toBe(source.workoutGlobalId); });
  it("never replaces completed, skipped, or detached history", () => { const before = [{ status: "COMPLETED", workoutVersionId: "v1" }, { status: "SKIPPED", workoutVersionId: "v1" }, { status: "PLANNED", detachedFromSeries: true, workoutVersionId: "v1" }, { status: "PLANNED", workoutVersionId: "v1" }]; expect(replaceFutureScheduleOnly(before, "v2").map(item => item.workoutVersionId)).toEqual(["v1", "v1", "v1", "v2"]); expect(before.every(item => item.workoutVersionId === "v1")).toBe(true); });
  it("publishes and validates a deterministic fixture manifest", () => { expect(canonicalFixtureManifest).toEqual(checkedManifest); expect(canonicalFixtureManifest).toMatchObject({ workoutCount: 21, planCount: 3, classification: "DEMO_FIXTURE" }); expect(Object.values(canonicalFixtureManifest.workoutChecksums).every(value => value.length === 64)).toBe(true); });
  it("keeps the checked-in Studio and Android contracts byte-identical", () => {
    const studio = readFileSync(resolve("contracts/canonical-contract.json"), "utf8");
    const android = readFileSync(resolve("../Hv1Strength-entitlement-reconciliation/contracts/canonical-contract.json"), "utf8");
    expect(android).toBe(studio);
  });
});
