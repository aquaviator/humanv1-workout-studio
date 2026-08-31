export interface Exercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string[];
  aliases: string[];
  metricProfile?: any;
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
