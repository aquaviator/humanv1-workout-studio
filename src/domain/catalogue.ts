export interface MetricProfile {
  primary: string[];
  secondary: string[];
  optional: string[];
  unsupported: string[];
}

export interface Exercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string[];
  aliases: string[];
  metricProfile: MetricProfile;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  muscleArea?: string[];
  movementPattern?: string[];
  environment?: string[];
  laterality?: string;
  modalitySuitability?: string[];
  technicalComplexity?: string;
  riskIndicators?: string[];
  specialistReview?: boolean;
  tags?: string[];
  source?: "HUMANV1_CATALOGUE" | "PRIVATE";
  provenance?: {
    ownerHumanUserId?: string;
    originApplication?: string;
    revision?: number;
    schemaVersion?: number;
    archived?: boolean;
  };
}

export interface PrivateExercise extends Exercise {
  source: "PRIVATE";
  description?: string;
  provenance: {
    ownerHumanUserId: string;
    originApplication: "HUMAN_STRENGTH" | "WORKOUT_STUDIO" | string;
    revision: number;
    schemaVersion: number;
    archived: boolean;
  };
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  originDeviceId: string;
  syncState: "Local draft" | "Synced" | "Queued" | "App update available" | "Studio update available" | "Conflict" | "Retry required" | "Archived";
}

export interface CatalogueRelease {
  releaseId: string;
  timestamp: number;
  count: number;
  checksum: string;
}

export interface CatalogueRepository {
  getExercises(): Promise<Exercise[]>;
  syncCatalogue(): Promise<void>;
}
