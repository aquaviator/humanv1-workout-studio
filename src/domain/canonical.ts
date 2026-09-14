import { sha256 } from "js-sha256";

export const CANONICAL_WORKOUT_SCHEMA = "humanv1.canonical-workout/1" as const;
export const CANONICAL_PLAN_SCHEMA = "humanv1.canonical-plan/1" as const;

export type ContentClass = "GOVERNED_LIBRARY" | "USER_AUTHORED" | "LEGACY_NORMALIZABLE" | "LEGACY_INCOMPLETE" | "HISTORICAL_EXECUTION" | "CONFLICTED";
export type CanonicalDiscipline = "STRENGTH" | "RUNNING" | "CYCLING" | "SWIMMING" | "MULTISPORT" | "HYROX" | "MOBILITY" | "RECOVERY";
export type ExecutionStructure = "STRAIGHT_SETS" | "SUPERSET" | "CIRCUIT" | "INTERVAL" | "AMRAP" | "EMOM" | "TIME_CAP" | "DISTANCE" | "RUN_WALK" | "CYCLING_INTERVAL" | "SWIM_INTERVAL" | "BRICK" | "TRANSITION" | "RECOVERY" | "WARM_UP" | "COOL_DOWN";
export type PublicationEligibility = "ELIGIBLE" | "USER_REVIEW_REQUIRED" | "INELIGIBLE";

export interface CanonicalOwner { humanUserId: string; firebaseUid?: string }
export interface CanonicalProvenance { contentClass: ContentClass; originApplication: string; sourceId?: string; researchReferences?: string[]; fixtureClassification?: "DEMO_FIXTURE" | "RESEARCH_CANDIDATE" }
export interface CanonicalSetPrescription {
  setId: string; order: number; repetitions?: { minimum?: number; target?: number; maximum?: number }; durationSeconds?: number;
  distanceMetres?: number; load?: { value: number; unit: "kg" | "lb" | "%1RM" }; restAfterSeconds?: number; tempo?: string;
  intensity?: { scale: "RPE" | "RIR" | "PACE" | "POWER" | "HEART_RATE_ZONE" | "CSS"; target: string };
  side?: "BILATERAL" | "LEFT" | "RIGHT" | "ALTERNATING" | "EACH_SIDE";
}
export interface CanonicalExercisePlacement {
  placementId: string; order: number; exerciseReference: { kind: "GOVERNED" | "PRIVATE"; exerciseId: string; releaseId?: string };
  sets: CanonicalSetPrescription[]; equipment: string[]; instructions?: string;
}
export interface CanonicalWorkoutBlock {
  blockId: string; order: number; structure: ExecutionStructure; title?: string; rounds?: number; timeCapSeconds?: number;
  placements: CanonicalExercisePlacement[]; recoverySeconds?: number; transition?: { from: CanonicalDiscipline; to: CanonicalDiscipline; durationSeconds?: number };
}
export interface CanonicalWorkout {
  schemaVersion: typeof CANONICAL_WORKOUT_SCHEMA; workoutGlobalId: string; publicationVersionId?: string; revision: number; checksum: string;
  owner: CanonicalOwner | null; provenance: CanonicalProvenance; discipline: CanonicalDiscipline; workoutType: string; title: string; description: string;
  blocks: CanonicalWorkoutBlock[]; estimatedDuration?: { seconds: number; provenance: "RECORDED" | "CALCULATED" };
  validationStatus: "VALID" | "INVALID" | "REVIEW_REQUIRED"; createdAt: string; updatedAt: string; tombstoneState: "ACTIVE" | "TOMBSTONED";
  publicationEligibility: PublicationEligibility; migration?: { sourceSchema: string; normalizedAt?: string; auditId?: string };
}
export interface CanonicalPlanPlacement {
  placementId: string; order: number; daySlot: number; workoutVersionId: string; required: boolean; priority: boolean; adaptation: "FIXED" | "OPTIONAL" | "ADAPTIVE";
  recurrence?: { frequency: "WEEKLY"; interval: number; count?: number };
}
export interface CanonicalPlanWeek { weekId: string; order: number; recoveryWeek: boolean; placements: CanonicalPlanPlacement[] }
export interface CanonicalPlanPhase { phaseId: string; order: number; title: string; cycleIds: string[] }
export interface CanonicalPlanCycle { cycleId: string; order: number; title: string; weekIds: string[] }
export interface CanonicalPlan {
  schemaVersion: typeof CANONICAL_PLAN_SCHEMA; planGlobalId: string; publicationVersionId?: string; revision: number; checksum: string;
  owner: CanonicalOwner | null; provenance: CanonicalProvenance; title: string; goal: string; athleteLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "ALL";
  durationWeeks: number; timezone: string; startDate: string; targetEvent?: { title: string; date: string }; phases: CanonicalPlanPhase[]; cycles: CanonicalPlanCycle[];
  weeks: CanonicalPlanWeek[]; publicationEligibility: PublicationEligibility; validationStatus: "VALID" | "INVALID" | "REVIEW_REQUIRED";
  createdAt: string; updatedAt: string; tombstoneState: "ACTIVE" | "TOMBSTONED"; acknowledgement?: { applicationId: string; versionId: string; checksum: string; state: "PENDING" | "APPLIED" | "REJECTED" };
}

export interface CanonicalIssue { fieldPath: string; rule: string; explanation: string }

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined && key !== "checksum").sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}
export const canonicalChecksum = (value: unknown): string => sha256(canonicalJson(value));
export const deterministicOccurrenceId = (planVersionId: string, placementId: string, epochDay: number): string => `occ_${sha256(`${planVersionId}|${placementId}|${epochDay}`).slice(0, 24)}`;

const hasPrescription = (set: CanonicalSetPrescription) => Boolean(set.repetitions || set.durationSeconds !== undefined || set.distanceMetres !== undefined || set.load || set.intensity);
export function validateCanonicalWorkout(value: CanonicalWorkout): CanonicalIssue[] {
  const issues: CanonicalIssue[] = [];
  if (value.schemaVersion !== CANONICAL_WORKOUT_SCHEMA) issues.push({ fieldPath: "schemaVersion", rule: "SUPPORTED_SCHEMA", explanation: "Workout schema is unsupported." });
  if (!value.workoutGlobalId || !value.title.trim()) issues.push({ fieldPath: !value.workoutGlobalId ? "workoutGlobalId" : "title", rule: "REQUIRED_FIELD", explanation: "Workout identity and title are required." });
  const blockIds = new Set<string>(); const placementIds = new Set<string>(); const setIds = new Set<string>();
  if (!value.blocks.length) issues.push({ fieldPath: "blocks", rule: "EXECUTABLE_BLOCK_REQUIRED", explanation: "Workout needs user input because no executable blocks were recorded." });
  value.blocks.forEach((block, bi) => {
    if (blockIds.has(block.blockId)) issues.push({ fieldPath: `blocks[${bi}].blockId`, rule: "STABLE_ID_UNIQUE", explanation: "Block ID is duplicated." }); blockIds.add(block.blockId);
    if (!block.placements.length && block.structure !== "TRANSITION") issues.push({ fieldPath: `blocks[${bi}].placements`, rule: "PLACEMENT_REQUIRED", explanation: "Block has no recorded exercise placement." });
    block.placements.forEach((placement, pi) => {
      if (placementIds.has(placement.placementId)) issues.push({ fieldPath: `blocks[${bi}].placements[${pi}].placementId`, rule: "STABLE_ID_UNIQUE", explanation: "Placement ID is duplicated." }); placementIds.add(placement.placementId);
      if (!placement.exerciseReference.exerciseId) issues.push({ fieldPath: `blocks[${bi}].placements[${pi}].exerciseReference`, rule: "EXERCISE_REFERENCE_REQUIRED", explanation: "Exercise reference is missing." });
      if (!placement.sets.length) issues.push({ fieldPath: `blocks[${bi}].placements[${pi}].sets`, rule: "PRESCRIPTION_REQUIRED", explanation: "No set prescription was recorded." });
      placement.sets.forEach((set, si) => { if (setIds.has(set.setId)) issues.push({ fieldPath: `blocks[${bi}].placements[${pi}].sets[${si}].setId`, rule: "STABLE_ID_UNIQUE", explanation: "Set ID is duplicated." }); setIds.add(set.setId); if (!hasPrescription(set)) issues.push({ fieldPath: `blocks[${bi}].placements[${pi}].sets[${si}]`, rule: "EXECUTION_TARGET_REQUIRED", explanation: "Set has no recorded repetitions, duration, distance, load or intensity." }); });
    });
  });
  if (value.checksum && value.checksum !== canonicalChecksum(value)) issues.push({ fieldPath: "checksum", rule: "CHECKSUM_MATCH", explanation: "Workout checksum does not match its canonical payload." });
  return issues;
}

export function validateCanonicalPlan(value: CanonicalPlan): CanonicalIssue[] {
  const issues: CanonicalIssue[] = [];
  if (value.schemaVersion !== CANONICAL_PLAN_SCHEMA) issues.push({ fieldPath: "schemaVersion", rule: "SUPPORTED_SCHEMA", explanation: "Plan schema is unsupported." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate)) issues.push({ fieldPath: "startDate", rule: "EXPLICIT_DATE_REQUIRED", explanation: "Plan start date must be explicit." });
  if (!value.timezone.trim()) issues.push({ fieldPath: "timezone", rule: "TIMEZONE_REQUIRED", explanation: "Plan timezone is required." });
  if (value.durationWeeks !== value.weeks.length) issues.push({ fieldPath: "durationWeeks", rule: "DURATION_MATCH", explanation: "Plan duration must match its ordered weeks." });
  const ids = new Set<string>(); value.weeks.forEach((week, wi) => week.placements.forEach((placement, pi) => { if (ids.has(placement.placementId)) issues.push({ fieldPath: `weeks[${wi}].placements[${pi}].placementId`, rule: "STABLE_ID_UNIQUE", explanation: "Placement ID is duplicated." }); ids.add(placement.placementId); if (!placement.workoutVersionId) issues.push({ fieldPath: `weeks[${wi}].placements[${pi}].workoutVersionId`, rule: "IMMUTABLE_DEPENDENCY_REQUIRED", explanation: "Placement requires an immutable workout version." }); }));
  if (value.checksum && value.checksum !== canonicalChecksum(value)) issues.push({ fieldPath: "checksum", rule: "CHECKSUM_MATCH", explanation: "Plan checksum does not match its canonical payload." });
  return issues;
}

export function cloneLibraryWorkout(source: CanonicalWorkout, owner: CanonicalOwner, createdAt: string): CanonicalWorkout {
  if (source.provenance.contentClass !== "GOVERNED_LIBRARY" || !source.publicationVersionId) throw new Error("IMMUTABLE_LIBRARY_VERSION_REQUIRED");
  const workoutGlobalId = `user_workout_${sha256(`${owner.humanUserId}|${source.publicationVersionId}`).slice(0, 20)}`;
  const clone: CanonicalWorkout = { ...structuredClone(source), workoutGlobalId, publicationVersionId: undefined, revision: 1, checksum: "", owner,
    provenance: { contentClass: "USER_AUTHORED", originApplication: "WORKOUT_STUDIO", sourceId: source.publicationVersionId }, createdAt, updatedAt: createdAt };
  clone.checksum = canonicalChecksum(clone); return clone;
}

export function replaceFutureScheduleOnly<T extends { status: string; detachedFromSeries?: boolean; workoutVersionId: string }>(occurrences: readonly T[], nextVersionId: string): T[] {
  return occurrences.map(item => item.status === "COMPLETED" || item.status === "SKIPPED" || item.detachedFromSeries ? item : { ...item, workoutVersionId: nextVersionId });
}
