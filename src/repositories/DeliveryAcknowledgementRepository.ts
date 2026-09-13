import { collection, getDocs } from 'firebase/firestore';
import { db } from '../config/firebase';

export type DeliveryState = 'APPLIED' | 'CONFLICT' | 'REJECTED';
export interface DeliveryAcknowledgement {
  acknowledgementId: string;
  humanUserId: string;
  workoutGlobalId: string;
  versionId: string;
  applicationId: 'HUMAN_STRENGTH';
  appliedChecksum: string;
  sourceRevision: number;
  state: DeliveryState;
  reasonCode: string | null;
}
export interface PlanDeliveryAcknowledgement {
  schemaVersion: 1;
  acknowledgementId: string;
  humanUserId: string;
  planGlobalId: string;
  planVersionId: string;
  planChecksum: string;
  applicationId: 'HUMAN_STRENGTH';
  sourceRevision: number;
  workoutVersionIds: string[];
  state: DeliveryState;
  reasonCode: string | null;
}

type DeliveryAcknowledgementLoader = (humanUserId: string) => Promise<unknown[]>;
type PlanAcknowledgementLoader = (humanUserId: string) => Promise<Array<{ id: string; data: Record<string, unknown> }>>;

export class DeliveryAcknowledgementRepository {
  constructor(private readonly load: DeliveryAcknowledgementLoader = async humanUserId => {
    const snapshot = await getDocs(collection(db, 'users', humanUserId, 'workoutDeliveryAcks'));
    return snapshot.docs.map(item => item.data());
  }, private readonly loadPlans: PlanAcknowledgementLoader = async humanUserId => {
    const snapshot = await getDocs(collection(db, 'users', humanUserId, 'planDeliveryAcks'));
    return snapshot.docs.map(item => ({ id: item.id, data: item.data() }));
  }) {}

  async listForOwner(humanUserId: string): Promise<DeliveryAcknowledgement[]> {
    return (await this.load(humanUserId)).filter((candidate): candidate is DeliveryAcknowledgement & { schemaVersion: number } => {
      if (typeof candidate !== 'object' || candidate === null) return false;
      const value = candidate as Record<string, unknown>;
      return value.schemaVersion === 1 && value.humanUserId === humanUserId &&
      typeof value.workoutGlobalId === 'string' && value.applicationId === 'HUMAN_STRENGTH' &&
      typeof value.versionId === 'string' && typeof value.appliedChecksum === 'string' &&
      typeof value.sourceRevision === 'number' && typeof value.state === 'string' &&
        ['APPLIED', 'CONFLICT', 'REJECTED'].includes(value.state)
        && (value.reasonCode === null || typeof value.reasonCode === 'string');
    }).sort((a, b) => b.sourceRevision - a.sourceRevision);
  }

  async listForWorkout(humanUserId: string, workoutGlobalId: string): Promise<DeliveryAcknowledgement[]> {
    return (await this.listForOwner(humanUserId)).filter(value => value.workoutGlobalId === workoutGlobalId);
  }

  async findExactPlan(humanUserId: string, expected: Omit<PlanDeliveryAcknowledgement, 'schemaVersion' | 'acknowledgementId' | 'humanUserId' | 'applicationId' | 'state' | 'reasonCode'>): Promise<PlanDeliveryAcknowledgement | null> {
    const snapshot = await this.loadPlans(humanUserId);
    const dependencies = [...expected.workoutVersionIds].sort();
    for (const item of snapshot) {
      const value = item.data;
      if (value.schemaVersion !== 1 || value.humanUserId !== humanUserId || value.applicationId !== 'HUMAN_STRENGTH') continue;
      if (value.planGlobalId !== expected.planGlobalId || value.planVersionId !== expected.planVersionId || value.planChecksum !== expected.planChecksum || value.sourceRevision !== expected.sourceRevision) continue;
      const actual = Array.isArray(value.workoutVersionIds) ? value.workoutVersionIds.filter((entry): entry is string => typeof entry === 'string').sort() : [];
      if (JSON.stringify(actual) !== JSON.stringify(dependencies) || !['APPLIED', 'CONFLICT', 'REJECTED'].includes(String(value.state))) continue;
      return { ...(value as unknown as PlanDeliveryAcknowledgement), acknowledgementId: item.id };
    }
    return null;
  }
}

export const deliveryAcknowledgementRepository = new DeliveryAcknowledgementRepository();
