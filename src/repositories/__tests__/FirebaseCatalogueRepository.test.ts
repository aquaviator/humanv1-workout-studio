import { describe, expect, it } from 'vitest';
import { asExercise, catalogueChecksum, metricProfileFromCapabilities, parseCatalogueDocuments } from '../FirebaseCatalogueRepository';

const governedExercise = (exerciseId: string, overrides: Record<string, unknown> = {}): any => ({
  schemaVersion: 1,
  exerciseId,
  displayName: `Exercise ${exerciseId}`,
  category: 'strength',
  aliases: ['example'],
  equipment: ['barbell'],
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes'],
  movementPatterns: ['squat'],
  laterality: 'bilateral',
  exerciseType: 'resistance',
  homeSuitable: true,
  gymSuitable: true,
  recommendedForStrength: true,
  trackingCapabilities: ['bodyweight', 'load', 'repetitions', 'rpe', 'tempo'],
  ...overrides,
});

describe('FirebaseCatalogueRepository governed catalogue adapter', () => {
  it('maps governed identity, display fields and strength capabilities without enrichment', () => {
    const exercise = asExercise(governedExercise('barbell_squat'), 'barbell_squat');
    expect(exercise).toMatchObject({
      exerciseId: 'barbell_squat', name: 'Exercise barbell_squat', aliases: ['example'],
      movementPattern: ['squat'], environment: ['home', 'gym'],
      metricProfile: { primary: ['repetitions', 'external_load'], secondary: ['rpe', 'tempo'], optional: [], unsupported: [] },
    });
  });

  it('maps cardio and the complete governed capability vocabulary like Android', () => {
    expect(metricProfileFromCapabilities(['duration', 'distance', 'pace', 'calories', 'rir', 'intervals', 'side']))
      .toEqual({ primary: ['duration', 'distance'], secondary: ['rir', 'intervals', 'side'], optional: ['energy'], unsupported: [] });
    expect(metricProfileFromCapabilities(['bodyweight', 'assisted_load', 'repetitions', 'rpe']))
      .toEqual({ primary: ['repetitions', 'assistance'], secondary: ['rpe'], optional: [], unsupported: [] });
    expect(metricProfileFromCapabilities(['bodyweight', 'weighted_bodyweight', 'repetitions']))
      .toEqual({ primary: ['repetitions', 'external_load'], secondary: [], optional: [], unsupported: [] });
  });

  it('rejects document identity mismatches, malformed records and unknown capabilities', () => {
    expect(() => asExercise(governedExercise('one'), 'two')).toThrow(/identity/);
    expect(() => asExercise({ ...governedExercise('one'), displayName: '' }, 'one')).toThrow(/display name/);
    expect(() => metricProfileFromCapabilities(['telepathy'])).toThrow(/unsupported tracking capabilities/);
  });

  it('accepts a complete 955-document release with unique authoritative document IDs', () => {
    const documents = Array.from({ length: 955 }, (_, index) => {
      const id = `exercise_${String(index).padStart(4, '0')}`;
      return { id, data: governedExercise(id) };
    });
    const parsed = parseCatalogueDocuments(documents);
    expect(parsed.exercises).toHaveLength(955);
    expect(new Set(parsed.exercises.map(item => item.exerciseId)).size).toBe(955);
    expect(catalogueChecksum(parsed.raw)).toBe(catalogueChecksum([...parsed.raw].reverse()));
  });
});
