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

type DeliveryAcknowledgementLoader = (humanUserId: string) => Promise<unknown[]>;

export class DeliveryAcknowledgementRepository {
  constructor(private readonly load: DeliveryAcknowledgementLoader = async humanUserId => {
    const snapshot = await getDocs(collection(db, 'users', humanUserId, 'workoutDeliveryAcks'));
    return snapshot.docs.map(item => item.data());
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
}

export const deliveryAcknowledgementRepository = new DeliveryAcknowledgementRepository();
