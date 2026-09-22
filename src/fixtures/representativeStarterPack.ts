import { sha256 } from "js-sha256";
import type { RegisteredStarterPack, StarterPackWeek } from "../domain/starterPack";
import { registeredPackId, starterPackChecksum } from "../domain/starterPack";
import { representativeWorkoutManifest } from "./representativeWorkoutManifest";

const placement = (week: number, dayOfWeek: number, workoutSemanticKey: string, ordinal = 1) => ({
  semanticKey: `week-${week}-day-${dayOfWeek}-${ordinal}-${workoutSemanticKey}`,
  workoutSemanticKey,
  dayOfWeek,
  preferredMinuteOfDay: dayOfWeek === 6 || dayOfWeek === 7 ? 540 : 1080,
});
const week = (weekNumber: number, label: string, recoveryWeek: boolean, entries: Array<[number, string]>): StarterPackWeek => ({
  semanticKey: `week-${weekNumber}`,
  label,
  recoveryWeek,
  placements: entries.map(([day, workout], index) => placement(weekNumber, day, workout, index + 1)),
});

const weeks: StarterPackWeek[] = [
  week(1, "Foundation", false, [[1,"recovery-session"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[5,"mobility-reset"],[6,"endurance-ride"],[7,"full-body-strength-b"]]),
  week(2, "Foundation", false, [[1,"mobility-reset"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[4,"bike-intervals"],[6,"endurance-ride"],[7,"full-body-strength-b"]]),
  week(3, "Foundation progression", false, [[1,"recovery-session"],[2,"full-body-strength-a"],[3,"tempo-run"],[5,"mobility-reset"],[6,"endurance-ride"],[7,"easy-aerobic-run"]]),
  week(4, "Recovery", true, [[1,"mobility-reset"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[5,"recovery-session"],[6,"endurance-ride"]]),
  week(5, "Aerobic build", false, [[1,"recovery-session"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[4,"bike-intervals"],[6,"endurance-ride"],[7,"full-body-strength-b"]]),
  week(6, "Aerobic build", false, [[1,"mobility-reset"],[2,"full-body-strength-b"],[3,"tempo-run"],[5,"recovery-session"],[6,"endurance-ride"],[7,"easy-aerobic-run"]]),
  week(7, "Sustainable build", false, [[1,"recovery-session"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[4,"bike-intervals"],[6,"endurance-ride"],[7,"full-body-strength-b"]]),
  week(8, "Recovery", true, [[1,"mobility-reset"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[5,"recovery-session"],[6,"endurance-ride"]]),
  week(9, "Consolidation", false, [[1,"recovery-session"],[2,"full-body-strength-b"],[3,"tempo-run"],[5,"mobility-reset"],[6,"endurance-ride"],[7,"easy-aerobic-run"]]),
  week(10, "Transition", false, [[1,"mobility-reset"],[2,"full-body-strength-a"],[3,"easy-aerobic-run"],[5,"recovery-session"],[6,"endurance-ride"]]),
];

const operationNamespace = representativeWorkoutManifest.operationNamespace;
const packWithoutChecksum: Omit<RegisteredStarterPack, "contentChecksum"> = {
  schemaVersion: "humanv1.registered-starter-pack/1",
  packId: registeredPackId(operationNamespace),
  datasetVersion: representativeWorkoutManifest.datasetVersion,
  name: "Recreational Multi-Sport Starter Pack",
  description: "Eight editable strength, running, cycling, mobility and recovery workouts with a sustainable ten-week base plan.",
  intendedAudience: "Recreational athletes building consistent general multi-sport fitness.",
  workoutManifest: representativeWorkoutManifest,
  planManifest: { semanticKey: "recreational-multisport-base-10-weeks", title: "Recreational Multi-Sport Base — 10 Weeks", description: "A sustainable ten-week foundation balancing aerobic development, strength, mobility and recovery.", timezone: "Europe/London", weeks },
  compatibleCatalogueReleaseIds: ["strength-2026.08.36-v1"],
  evidenceStatus: "PRODUCT_REVIEWED",
  prerequisites: ["Able to complete easy walking, running or cycling at a conversational effort", "Able to perform basic strength exercises with controlled technique"],
  migrationPolicy: "FAIL_ON_DIFFERENT_CONTENT",
  idempotencyIdentity: sha256(`humanv1.registered-starter-pack/1|${operationNamespace}|${representativeWorkoutManifest.datasetVersion}`),
};

export const representativeStarterPack: RegisteredStarterPack = { ...packWithoutChecksum, contentChecksum: starterPackChecksum(packWithoutChecksum) };

export const registeredStarterPacks = new Map([[representativeStarterPack.packId, representativeStarterPack]] as const);

