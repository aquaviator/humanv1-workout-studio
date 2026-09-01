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

function asExercise(value: Json): Exercise {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Exercise is not an object');
  if (typeof value.exerciseId !== 'string' || typeof value.name !== 'string') throw new Error('Exercise stable ID or name is missing');
  return {
    exerciseId: value.exerciseId,
    name: value.name,
    category: typeof value.category === 'string' ? value.category : '',
    equipment: Array.isArray(value.equipment) ? value.equipment.filter((v): v is string => typeof v === 'string') : [],
    aliases: Array.isArray(value.aliases) ? value.aliases.filter((v): v is string => typeof v === 'string') : [],
    metricProfile: metricProfile(value.metricProfile),
    primaryMuscles: strings(value.primaryMuscles),
    secondaryMuscles: strings(value.secondaryMuscles),
    muscleArea: strings(value.muscleArea),
    movementPattern: strings(value.movementPattern),
    environment: strings(value.environment),
    laterality: typeof value.laterality === 'string' ? value.laterality : undefined,
    modalitySuitability: strings(value.modalitySuitability),
    technicalComplexity: typeof value.technicalComplexity === 'string' ? value.technicalComplexity : undefined,
    riskIndicators: strings(value.riskIndicators),
    specialistReview: typeof value.specialistReview === 'boolean' ? value.specialistReview : undefined,
    tags: strings(value.tags),
  };
}

function metricProfile(value: Json | undefined): MetricProfile {
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Exercise metric profile is invalid');
  const required = ['primary', 'secondary', 'optional', 'unsupported'] as const;
  const result = required.map(key => value[key]);
  if (!result.every(item => Array.isArray(item) && item.every(entry => typeof entry === 'string'))) throw new Error('Exercise metric profile is invalid');
  return { primary: result[0] as string[], secondary: result[1] as string[], optional: result[2] as string[], unsupported: result[3] as string[] };
}

function strings(value: Json | undefined): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

export class FirebaseCatalogueRepository implements CatalogueRepository {
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
    const raw: Json[] = [];
    const seen = new Set<string>();
    for (const item of snapshot.docs) {
      const value = item.data() as Json;
      const exercise = asExercise(value);
      if (item.id !== exercise.exerciseId || seen.has(exercise.exerciseId)) throw new Error('Duplicate or mismatched exercise stable ID');
      seen.add(exercise.exerciseId);
      raw.push(value);
    }
    if (raw.length !== metadata.exerciseCount) throw new Error('Catalogue exercise count mismatch');
    const checksum = catalogueChecksum(raw);
    if (checksum !== metadata.contentSha256.toLowerCase()) throw new Error('Catalogue checksum mismatch');

    const envelope: CatalogueEnvelope = {
      releaseId,
      catalogueVersion: metadata.catalogueVersion,
      contentSha256: checksum,
      exercises: raw.map(asExercise).sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)),
    };
    await idb.set(IDB_CATALOGUE_ENVELOPE_KEY, envelope);
  }
}

export const catalogueRepository = new FirebaseCatalogueRepository();
