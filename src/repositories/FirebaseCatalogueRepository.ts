import { CatalogueRepository, Exercise, CatalogueRelease } from '../domain/catalogue';
import { db } from '../config/firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import * as idb from 'idb-keyval';
import fallbackExercises from '../fixtures/exercises.json';

const IDB_CATALOGUE_KEY = 'humanv1_exercise_catalogue';
const IDB_RELEASE_KEY = 'humanv1_catalogue_release';

export class FirebaseCatalogueRepository implements CatalogueRepository {
  async getExercises(): Promise<Exercise[]> {
    const local = await idb.get<Exercise[]>(IDB_CATALOGUE_KEY);
    if (local && local.length > 0) {
      return local;
    }
    return fallbackExercises as Exercise[];
  }

  async syncCatalogue(): Promise<void> {
    try {
      const currentRef = doc(db, 'exercise_catalogue', 'current');
      const currentSnap = await getDoc(currentRef);
      if (!currentSnap.exists()) return;
      
      const releaseId = currentSnap.data().releaseId;
      if (!releaseId) return;

      const localRelease = await idb.get<string>(IDB_RELEASE_KEY);
      if (localRelease === releaseId) {
        return; // Already up to date
      }

      const releaseRef = doc(db, 'exercise_catalogue', releaseId);
      const releaseSnap = await getDoc(releaseRef);
      if (!releaseSnap.exists()) return;

      const releaseData = releaseSnap.data();
      // Validate schema
      if (typeof releaseData.count !== 'number' || typeof releaseData.checksum !== 'string') {
         return; // Invalid schema
      }

      const exercisesRef = collection(db, 'exercise_catalogue', releaseId, 'exercises');
      const exercisesSnap = await getDocs(exercisesRef);
      
      const exercises: Exercise[] = [];
      exercisesSnap.forEach(snap => {
        const data = snap.data();
        if (data.exerciseId && data.name) {
          exercises.push({
            exerciseId: data.exerciseId,
            name: data.name,
            category: data.category || '',
            equipment: data.equipment || [],
            aliases: data.aliases || [],
          });
        }
      });

      // Simple count validation
      if (exercises.length !== releaseData.count) {
         console.warn("Catalogue count mismatch");
         return;
      }

      // Transactional IDB save (idb-keyval setMany doesn't exist, we use a single key for array)
      await idb.set(IDB_CATALOGUE_KEY, exercises);
      await idb.set(IDB_RELEASE_KEY, releaseId);

    } catch (e) {
      console.error("Catalogue sync failed, retaining local/fallback", e);
    }
  }
}

export const catalogueRepository = new FirebaseCatalogueRepository();
