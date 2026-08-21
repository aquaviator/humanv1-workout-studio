export type StableId = string;

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

export type Block = ExerciseBlock | RestBlock | TransitionBlock | NoteBlock; // Extensible

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
}
