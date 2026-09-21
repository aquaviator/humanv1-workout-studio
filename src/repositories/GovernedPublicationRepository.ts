import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { PublishedEnvelope } from '../domain/publication';
import type { Workout } from '../domain/types';
import { assertMutationAllowed } from '../config/mutationPolicy';

export interface GovernedPlanPublication {
  planId: string;
  planVersionId: string;
  planRevision: number;
  planChecksum: string;
  workoutVersionIds: string[];
  reusedPlan: boolean;
}

export class GovernedPublicationRepository {
  async listWorkoutVersions(owner: string, workoutId: string): Promise<PublishedEnvelope<Workout>[]> {
    const snapshot = await getDocs(query(collection(db, 'users', owner, 'publishedWorkouts'), where('globalId', '==', workoutId)));
    return snapshot.docs.map(item => item.data() as PublishedEnvelope<Workout>).filter(item => item.humanUserId === owner && item.globalId === workoutId);
  }
  async publishWorkout(workoutId: string, expectedRevision: number): Promise<{ workoutId: string; versionId: string; revision: number; checksum: string; reused: boolean }> {
    assertMutationAllowed('publishWorkout');
    const idempotencyKey = `workout_${workoutId}_r${expectedRevision}`;
    const result = await httpsCallable(functions, 'publishStudioWorkout')({ workoutId, expectedRevision, idempotencyKey });
    return result.data as { workoutId: string; versionId: string; revision: number; checksum: string; reused: boolean };
  }
  async publishPlan(planId: string, expectedRevision: number): Promise<GovernedPlanPublication> {
    assertMutationAllowed('publishPlan');
    const idempotencyKey = `plan_${planId}_r${expectedRevision}`;
    const result = await httpsCallable<{ planId: string; expectedRevision: number; idempotencyKey: string }, GovernedPlanPublication>(functions, 'publishStudioPlan')({ planId, expectedRevision, idempotencyKey });
    return result.data;
  }
}

export const governedPublicationRepository = new GovernedPublicationRepository();
