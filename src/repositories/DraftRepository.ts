import { get, set, del, keys } from 'idb-keyval';
import { Workout, Plan, Protocol } from '../domain/types';

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

  // --- WORKOUTS ---

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

  // --- PLANS ---

  async savePlanDraft(userId: string, plan: Plan): Promise<void> {
    const key = this.getStoreKey(userId, 'plan', plan.planId);
    let currentDraft = await get<DraftEnvelope<Plan>>(key);
    const now = new Date().toISOString();
    const envelope: DraftEnvelope<Plan> = {
      schemaVersion: 1,
      globalId: plan.planId,
      humanUserId: userId,
      revision: currentDraft ? currentDraft.revision + 1 : 1,
      status: "DRAFT",
      payload: plan,
      createdAt: currentDraft ? currentDraft.createdAt : now,
      updatedAt: now,
      deletedAt: null,
      originClientId: "web_local_client",
    };
    await set(key, envelope);
  }

  async getPlanDraft(userId: string, planId: string): Promise<Plan | null> {
    const key = this.getStoreKey(userId, 'plan', planId);
    const draft = await get<DraftEnvelope<Plan>>(key);
    if (!draft || draft.deletedAt) return null;
    return draft.payload;
  }

  async listPlanDrafts(userId: string): Promise<Plan[]> {
    const allKeys = await keys();
    const planKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`drafts_${userId}_plan_`));
    const drafts: Plan[] = [];
    for (const key of planKeys) {
      const draft = await get<DraftEnvelope<Plan>>(key as string);
      if (draft && !draft.deletedAt) {
        drafts.push(draft.payload);
      }
    }
    return drafts;
  }

  // --- PROTOCOLS ---

  async saveProtocolDraft(userId: string, protocol: Protocol): Promise<void> {
    const key = this.getStoreKey(userId, 'protocol', protocol.protocolId);
    let currentDraft = await get<DraftEnvelope<Protocol>>(key);
    const now = new Date().toISOString();
    const envelope: DraftEnvelope<Protocol> = {
      schemaVersion: 1,
      globalId: protocol.protocolId,
      humanUserId: userId,
      revision: currentDraft ? currentDraft.revision + 1 : 1,
      status: "DRAFT",
      payload: protocol,
      createdAt: currentDraft ? currentDraft.createdAt : now,
      updatedAt: now,
      deletedAt: null,
      originClientId: "web_local_client",
    };
    await set(key, envelope);
  }

  async getProtocolDraft(userId: string, protocolId: string): Promise<Protocol | null> {
    const key = this.getStoreKey(userId, 'protocol', protocolId);
    const draft = await get<DraftEnvelope<Protocol>>(key);
    if (!draft || draft.deletedAt) return null;
    return draft.payload;
  }

  async listProtocolDrafts(userId: string): Promise<Protocol[]> {
    const allKeys = await keys();
    const protocolKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`drafts_${userId}_protocol_`));
    const drafts: Protocol[] = [];
    for (const key of protocolKeys) {
      const draft = await get<DraftEnvelope<Protocol>>(key as string);
      if (draft && !draft.deletedAt) {
        drafts.push(draft.payload);
      }
    }
    return drafts;
  }
}

export const draftRepository = new DraftRepository();
