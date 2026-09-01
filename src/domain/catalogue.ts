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
