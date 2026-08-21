import { get, set, del, keys } from 'idb-keyval';
import { Workout } from '../domain/types';

export interface DraftEnvelope<T> {
  schemaVersion: number;
  globalId: string;
  humanUserId: string;
  revision: number;
  status: "DRAFT";
  payload: T;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  originClientId: string;
}

export class DraftRepository {
  private getStoreKey(userId: string, type: string, id: string) {
    return `drafts_${userId}_${type}_${id}`;
  }

  async saveWorkoutDraft(userId: string, workout: Workout): Promise<void> {
    const key = this.getStoreKey(userId, 'workout', workout.workoutId);
    
    let currentDraft = await get<DraftEnvelope<Workout>>(key);
    
    const now = new Date().toISOString();
    
    const envelope: DraftEnvelope<Workout> = {
      schemaVersion: 1,
      globalId: workout.workoutId,
      humanUserId: userId,
      revision: currentDraft ? currentDraft.revision + 1 : 1,
      status: "DRAFT",
      payload: workout,
      createdAt: currentDraft ? currentDraft.createdAt : now,
      updatedAt: now,
      deletedAt: null,
      originClientId: "web_local_client",
    };

    await set(key, envelope);
  }

  async getWorkoutDraft(userId: string, workoutId: string): Promise<Workout | null> {
    const key = this.getStoreKey(userId, 'workout', workoutId);
    const draft = await get<DraftEnvelope<Workout>>(key);
    if (!draft || draft.deletedAt) return null;
    return draft.payload;
  }

  async listWorkoutDrafts(userId: string): Promise<Workout[]> {
    const allKeys = await keys();
    const workoutKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`drafts_${userId}_workout_`));
    
    const drafts: Workout[] = [];
    for (const key of workoutKeys) {
      const draft = await get<DraftEnvelope<Workout>>(key as string);
      if (draft && !draft.deletedAt) {
        drafts.push(draft.payload);
      }
    }
    return drafts;
  }

  async deleteWorkoutDraft(userId: string, workoutId: string): Promise<void> {
    const key = this.getStoreKey(userId, 'workout', workoutId);
    const draft = await get<DraftEnvelope<Workout>>(key);
    if (draft) {
      draft.deletedAt = new Date().toISOString();
      draft.updatedAt = draft.deletedAt;
      draft.revision += 1;
      await set(key, draft);
    }
  }
}

export const draftRepository = new DraftRepository();
