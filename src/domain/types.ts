export type StableId = string;
import type { ReconstructionDiagnostic } from "./presentation";

export interface MetricPrescription {
  prescriptionId: StableId;
  metricKey: string;
  minimumValue?: number;
  targetValue?: number;
  maximumValue?: number;
  textValue?: string;
  canonicalUnit?: string;
  position?: number;
}

export interface Effort {
  effortId: StableId;
  effortType: "WARM_UP" | "WORKING" | "DROP_SET" | "FAILURE" | "BACK_OFF" | "AMRAP" | "TIMED" | "DISTANCE" | "OPEN";
  prescriptions: MetricPrescription[];
  restAfterSeconds?: number;
  notes?: string;
}

export interface ExerciseBlock {
  blockId: StableId;
  type: "EXERCISE";
  exerciseId: StableId;
  exerciseNameSnapshot: string;
  efforts: Effort[];
  notes?: string;
  substitutionExerciseIds?: StableId[];
}

export interface RestBlock {
  blockId: StableId;
  type: "REST";
  durationSeconds: number;
  recoveryType: "PASSIVE" | "ACTIVE" | "OPEN";
  instructions?: string;
}

export interface TransitionBlock {
  blockId: StableId;
  type: "TRANSITION";
  durationSeconds: number;
  instructions?: string;
}

export interface NoteBlock {
  blockId: StableId;
  type: "NOTE";
  text: string;
}

export interface SupersetBlock {
  blockId: StableId;
  type: "SUPERSET";
  exercises: ExerciseBlock[];
  notes?: string;
}

export interface CircuitBlock {
  blockId: StableId;
  type: "CIRCUIT";
  exercises: ExerciseBlock[];
  rounds: number;
  notes?: string;
}

export type Block = ExerciseBlock | RestBlock | TransitionBlock | NoteBlock | SupersetBlock | CircuitBlock; // Extensible

export interface Workout {
  schemaVersion: string;
  workoutId: StableId;
  title: string;
  description?: string;
  discipline: "STRENGTH" | "HIIT" | "CIRCUIT" | "TABATA" | "HYBRID" | "CARDIO" | "MOBILITY";
  catalogueReleaseId: StableId;
  protocolReleaseId?: StableId;
  tags: string[];
  estimatedDurationSeconds?: number;
  blocks: Block[];
  reconstructionDiagnostics?: ReconstructionDiagnostic[];
}

export interface ProtocolSegmentTarget {
  metricKey: string;
  minimumValue?: number;
  maximumValue?: number;
  targetValue?: number;
  canonicalUnit: string;
}

export interface ProtocolSegment {
  segmentId: StableId;
  phase: "WARM_UP" | "WORK" | "REST" | "ACTIVE_RECOVERY" | "COOL_DOWN" | "PREP" | "TRANSITION" | "COOLDOWN";
  durationSeconds: number;
  repeatCount: number;
  targets: ProtocolSegmentTarget[];
  exerciseSlotCount: number;
  instructions: string;
}

export interface Protocol {
  schemaVersion: string;
  protocolId: StableId;
  title: string;
  summary: string;
  protocolType: string;
  status: "DRAFT" | "PUBLISHED";
  suitability: string[];
  equipmentCapabilityKeys: string[];
  populationNotes?: string;
  contraindicationNotes?: string;
  progressionNotes?: string;
  segments: ProtocolSegment[];
  evidence: string[];
}

export interface PlanPlacement {
  placementId: StableId;
  dayOfWeek: number;
  workoutId: StableId;
  /** Immutable versions are populated only for published/governed dependencies. */
  workoutVersionId?: StableId;
  dependency?: PlanDraftDependency;
  resolvedWorkout?: { workoutGlobalId: StableId; versionId: StableId; revision: number; checksum: string; schemaVersion: string };
  preferredMinuteOfDay: number | null;
  reminderEnabled: boolean;
  notes: string;
  /** Original Android schedule evidence. Optional for Studio-authored plans. */
  scheduledEpochDay?: number;
}

export type PlanDraftDependency =
  | { kind: "WORKOUT_DRAFT"; workoutDraftId: StableId; humanUserId: StableId; expectedRevision: number; expectedUpdatedAt?: string; displayName: string; originApplication: "WORKOUT_STUDIO"; previouslyResolvedVersionId?: StableId }
  | { kind: "PUBLISHED_WORKOUT_VERSION"; workoutGlobalId: StableId; versionId: StableId; revision: number; checksum: string; schemaVersion: "humanv1.canonical-workout/1"; displayName: string }
  | { kind: "GOVERNED_TEMPLATE"; templateId: StableId; immutableVersionId: StableId; displayName: string; provenance: "RESEARCH_CANDIDATE" | "GOVERNED_LIBRARY" };

export interface PlanDraftDependencyRecord {
  schemaVersion: "humanv1.studio-plan-draft-dependency/1";
  dependencyId: StableId;
  humanUserId: StableId;
  planId: StableId;
  placementId: StableId;
  dependencyKind: PlanDraftDependency["kind"];
  referencedStableId: StableId;
  expectedRevision: number | null;
  expectedUpdatedAt: string | null;
  immutableVersionId: StableId | null;
  immutableRevision: number | null;
  immutableChecksum: string | null;
  immutableSchemaVersion: string | null;
  displayName: string;
  provenance: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface PlanWeek {
  weekId: StableId;
  weekNumber: number;
  label: string;
  placements: PlanPlacement[];
}

export interface Plan {
  schemaVersion: string;
  planId: StableId;
  title: string;
  description: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  destinationApplication?: "HUMAN_STRENGTH";
  workoutVersionIds?: StableId[];
  weeks: PlanWeek[];
  notes?: string;
  reconstructionDiagnostics?: ReconstructionDiagnostic[];
    dependencyOwnerHumanUserId?: StableId;
    dependencyKinds?: Array<PlanDraftDependency["kind"]>;
    dependencyStorageVersion?: 1;
    dependencyCount?: number;
}
