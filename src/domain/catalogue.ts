export interface Exercise {
  exerciseId: string;
  name: string;
  category: string;
  equipment: string[];
  aliases: string[];
  metricProfile?: any;
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
