import { CatalogueRepository, Exercise } from '../domain/catalogue';
import { db } from '../config/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import * as idb from 'idb-keyval';
import fallbackExercises from '../fixtures/exercises.json';
import { sha256 } from 'js-sha256';

const IDB_CATALOGUE_ENVELOPE_KEY = 'humanv1_catalogue_envelope';

interface CatalogueEnvelope {
  releaseId: string;
  exercises: Exercise[];
}

function generateChecksum(exercises: Exercise[]): string {
  const str = JSON.stringify(exercises.sort((a, b) => a.exerciseId.localeCompare(b.exerciseId)));
  return sha256(str);
}

export class FirebaseCatalogueRepository implements CatalogueRepository {
  async getExercises(): Promise<Exercise[]> {
    const local = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
    if (local && local.exercises && local.exercises.length > 0) {
      return local.exercises;
    }
    return fallbackExercises as Exercise[];
  }

  async syncCatalogue(): Promise<void> {
    try {
      const currentRef = doc(db, 'exercise_catalogue', 'current');
      const currentSnap = await getDoc(currentRef);
      if (!currentSnap.exists()) {
        throw new Error("Catalogue pointer not found");
      }
      
      const currentData = currentSnap.data();
      if (!currentData || typeof currentData.releaseId !== 'string') {
        throw new Error("Invalid pointer shape");
      }
      const releaseId = currentData.releaseId;

      const local = await idb.get<CatalogueEnvelope>(IDB_CATALOGUE_ENVELOPE_KEY);
      if (local && local.releaseId === releaseId) {
        return; // Already up to date
      }

      // Read release from correct path
      const releaseRef = doc(db, 'exercise_catalogue_releases', releaseId);
      const releaseSnap = await getDoc(releaseRef);
      if (!releaseSnap.exists()) {
        throw new Error("Release document not found");
      }

      const releaseData = releaseSnap.data();
      
      // Validations:
      if (releaseData.releaseId !== releaseId) throw new Error("Release ID mismatch");
      if (releaseData.published !== true) throw new Error("Release not published");
      if (releaseData.validationState !== 'VALIDATED') throw new Error("Release not validated");
      if (releaseData.channel !== 'PRODUCTION') throw new Error("Not production channel");
      if (typeof releaseData.count !== 'number') throw new Error("Invalid count schema");
      if (typeof releaseData.checksum !== 'string') throw new Error("Invalid checksum schema");

      const exercisesRef = collection(db, 'exercise_catalogue_releases', releaseId, 'exercises');
      const exercisesSnap = await getDocs(exercisesRef);
      
      const exercises: Exercise[] = [];
      const seenIds = new Set<string>();

      exercisesSnap.forEach(snap => {
        const data = snap.data();
        if (data.exerciseId && typeof data.exerciseId === 'string' && data.name) {
          if (seenIds.has(data.exerciseId)) {
            throw new Error("Duplicate stable ID found in catalogue");
          }
          seenIds.add(data.exerciseId);
          exercises.push({
            exerciseId: data.exerciseId,
            name: data.name,
            category: data.category || '',
            equipment: data.equipment || [],
            aliases: data.aliases || [],
            metricProfile: data.metricProfile || 'REPS_ONLY'
          });
        } else {
          throw new Error("Required schema missing for exercise");
        }
      });

      if (exercises.length !== releaseData.count) {
         throw new Error(`Catalogue count mismatch. Expected ${releaseData.count}, got ${exercises.length}`);
      }

      const computedChecksum = generateChecksum(exercises);
      if (releaseData.checksum !== computedChecksum) {
         throw new Error(`Checksum mismatch. Expected ${releaseData.checksum}, got ${computedChecksum}`);
      }

      const envelope: CatalogueEnvelope = {
        releaseId,
        exercises
      };

      await idb.set(IDB_CATALOGUE_ENVELOPE_KEY, envelope);
    } catch (e) {
      console.error("Catalogue sync failed, retaining local/fallback", e);
      throw e; // Must throw to fail tests, do not silently pass.
    }
  }
}

export const catalogueRepository = new FirebaseCatalogueRepository();
