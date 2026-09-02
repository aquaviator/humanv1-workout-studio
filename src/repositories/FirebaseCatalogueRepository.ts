import { CatalogueRepository, Exercise, MetricProfile } from '../domain/catalogue';
import { db } from '../config/firebase';
import { collection, doc, getDoc, getDocs } from 'firebase/firestore';
import * as idb from 'idb-keyval';
import { sha256 } from 'js-sha256';

const IDB_CATALOGUE_ENVELOPE_KEY = 'humanv1_catalogue_envelope';
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface CatalogueEnvelope {
  releaseId: string;
  catalogueVersion: string;
  contentSha256: string;
  exercises: Exercise[];
}

export function canonicalJson(value: Json): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function catalogueChecksum(documents: Json[]): string {
  const sorted = [...documents].sort((a, b) => {
    const left = typeof a === 'object' && a && !Array.isArray(a) ? String(a.exerciseId || '') : '';
    const right = typeof b === 'object' && b && !Array.isArray(b) ? String(b.exerciseId || '') : '';
    return left.localeCompare(right);
  });
  return sha256(canonicalJson(sorted));
}

const GOVERNED_CAPABILITIES = new Set([
  'repetitions', 'load', 'duration', 'distance', 'bodyweight', 'assisted_load',
  'weighted_bodyweight', 'rpe', 'tempo', 'pace', 'calories', 'rir', 'intervals', 'side',
]);

export function metricProfileFromCapabilities(value: Json | undefined): MetricProfile {
  if (!Array.isArray(value) || !value.every(item => typeof item === 'string')) {
    throw new Error('Exercise tracking capabilities are invalid');
  }
  const capabilities = new Set(value);
  const unknown = value.filter(item => !GOVERNED_CAPABILITIES.has(item));
  if (unknown.length) throw new Error(`Exercise has unsupported tracking capabilities: ${unknown.join(', ')}`);

  const primary: string[] = [];
  if (capabilities.has('repetitions')) primary.push('repetitions');
  if (capabilities.has('duration')) primary.push('duration');
  if (capabilities.has('distance')) primary.push('distance');
  if (capabilities.has('load') || capabilities.has('weighted_bodyweight')) primary.push('external_load');
  if (capabilities.has('assisted_load')) primary.push('assistance');

  const secondary: string[] = [];
  if (capabilities.has('rpe')) secondary.push('rpe');
  if (capabilities.has('tempo')) secondary.push('tempo');
  if (capabilities.has('rir')) secondary.push('rir');
  if (capabilities.has('intervals')) secondary.push('intervals');
  if (capabilities.has('side')) secondary.push('side');

  return {
    primary,
    secondary,
    optional: capabilities.has('calories') ? ['energy'] : [],
    unsupported: [],
  };
}

export function asExercise(value: Json, documentId: string): Exercise {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Exercise is not an object');
  if (value.schemaVersion !== 1 || typeof value.exerciseId !== 'string' || !value.exerciseId.trim() ||
      value.exerciseId !== documentId || typeof value.displayName !== 'string' || !value.displayName.trim()) {
    throw new Error('Exercise governed identity, schema version, or display name is invalid');
  }
  const environments = [value.homeSuitable === true ? 'home' : '', value.gymSuitable === true ? 'gym' : ''].filter(Boolean);
  const modalities = [
    typeof value.exerciseType === 'string' ? value.exerciseType : '',
    value.cardioSuitable === true ? 'cardio' : '',
    value.circuitSuitable === true ? 'circuit' : '',
    value.recommendedForHiit === true ? 'hiit' : '',
    value.recommendedForStrength === true ? 'strength' : '',
  ].filter(Boolean);
  return {
    exerciseId: value.exerciseId,
    name: value.displayName,
    category: typeof value.category === 'string' ? value.category : '',
    equipment: Array.isArray(value.equipment) ? value.equipment.filter((v): v is string => typeof v === 'string') : [],
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((v): v is string => typeof v === 'string') : [],
    metricProfile: metricProfileFromCapabilities(value.trackingCapabilities),
    primaryMuscles: strings(value.primaryMuscles),
    secondaryMuscles: strings(value.secondaryMuscles),
    muscleArea: strings(value.muscleArea),
    movementPattern: strings(value.movementPatterns),
    environment: environments,
    laterality: typeof value.laterality === 'string' ? value.laterality : undefined,
    modalitySuitability: [...new Set(modalities)],
    technicalComplexity: typeof value.technicalComplexity === 'string' ? value.technicalComplexity : undefined,
    riskIndicators: strings(value.riskIndicators),
    specialistReview: typeof value.specialistReview === 'boolean' ? value.specialistReview : undefined,
    tags: strings(value.tags),
  };
}

function strings(value: Json | undefined): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

export function parseCatalogueDocuments(documents: Array<{ id: string; data: Json }>): { raw: Json[]; exercises: Exercise[] } {
  const raw: Json[] = [];
  const exercises: Exercise[] = [];
  const seen = new Set<string>();
  for (const item of documents) {
    const exercise = asExercise(item.data, item.id);
    if (seen.has(exercise.exerciseId)) throw new Error('Duplicate exercise stable ID');
    seen.add(exercise.exerciseId);
    raw.push(item.data);
    exercises.push(exercise);
  }
  return { raw, exercises: exercises.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)) };
}

export class FirebaseCatalogueRepository implements CatalogueRepository {
  async getActiveReleaseId(): Promise<string> {
    const local = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
    if (local?.releaseId) return local.releaseId;
    await this.syncCatalogue();
    const refreshed = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
    if (!refreshed?.releaseId) throw new Error('Catalogue release unavailable');
    return refreshed.releaseId;
  }
  async getExercises(): Promise<Exercise[]> {
    const local = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
    if (local?.exercises?.length) return local.exercises;
    await this.syncCatalogue();
    return (await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY))?.exercises ?? [];
  }

  async syncCatalogue(): Promise<void> {
    const pointer = await getDoc(doc(db, 'exercise_catalogue', 'current'));
    if (!pointer.exists() || typeof pointer.data().releaseId !== 'string') throw new Error('Invalid catalogue pointer');
    const releaseId = pointer.data().releaseId as string;
    const local = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
    if (local?.releaseId === releaseId) return;

    const release = await getDoc(doc(db, 'exercise_catalogue_releases', releaseId));
    if (!release.exists()) throw new Error('Catalogue release not found');
    const metadata = release.data();
    if (metadata.releaseId !== releaseId || metadata.schemaVersion !== 1 || metadata.status !== 'published' ||
        metadata.validationStatus !== 'validated' || metadata.channel !== 'production' ||
        typeof metadata.exerciseCount !== 'number' || typeof metadata.contentSha256 !== 'string' ||
        typeof metadata.catalogueVersion !== 'string') throw new Error('Catalogue release metadata is not governed');

    const snapshot = await getDocs(collection(db, 'exercise_catalogue_releases', releaseId, 'exercises'));
    const parsed = parseCatalogueDocuments(snapshot.docs.map(item => ({ id: item.id, data: item.data() as Json })));
    const raw = parsed.raw;
    if (raw.length !== metadata.exerciseCount) throw new Error('Catalogue exercise count mismatch');
    const checksum = catalogueChecksum(raw);
    if (checksum !== metadata.contentSha256.toLowerCase()) throw new Error('Catalogue checksum mismatch');

    const envelope: CatalogueEnvelope = {
      releaseId,
      catalogueVersion: metadata.catalogueVersion,
      contentSha256: checksum,
      exercises: parsed.exercises,
    };
    await idb.set(IDB_CATALOGUE_ENVELOPE_KEY, envelope);
  }
}

export const catalogueRepository = new FirebaseCatalogueRepository();
