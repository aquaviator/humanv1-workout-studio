import { get, set } from 'idb-keyval';

export type PlanDeliveryPhase =
  | 'VALIDATING'
  | 'PUBLISHING_WORKOUTS'
  | 'PUBLISHING_PLAN'
  | 'QUEUED_OFFLINE'
  | 'SENDING'
  | 'SENT_TO_HUMANV1'
  | 'WAITING_FOR_HUMANV1'
  | 'AVAILABLE_IN_HUMANV1'
  | 'PARTIALLY_DELIVERED'
  | 'CONFLICT'
  | 'FAILED';

export interface PlanDeliveryAttempt {
  humanUserId: string;
  planId: string;
  planVersionId?: string;
  planChecksum?: string;
  planRevision?: number;
  workoutVersionIds: string[];
  phase: PlanDeliveryPhase;
  lastAttemptedAt: string;
  failureCategory?: string;
}

const keyFor = (owner: string, planId: string) => `plan_delivery_${owner}_${planId}`;

export class PlanDeliveryRepository {
  async load(owner: string, planId: string): Promise<PlanDeliveryAttempt | null> {
    return (await get<PlanDeliveryAttempt>(keyFor(owner, planId))) ?? null;
  }

  async save(attempt: PlanDeliveryAttempt): Promise<void> {
    await set(keyFor(attempt.humanUserId, attempt.planId), attempt);
  }
}

export const planDeliveryRepository = new PlanDeliveryRepository();
