import { Entitlement, EntitlementRepository, EntitlementState } from '../domain/entitlement';
import { db } from '../config/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';

export class FirebaseEntitlementRepository implements EntitlementRepository {
  async getEntitlement(humanUserId: string): Promise<Entitlement> {
    try {
      const docRef = doc(db, 'entitlements', humanUserId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        return { state: 'EXPIRED' }; // Unverified users without document cannot bypass offline
      }
      return this.mapData(snapshot.data());
    } catch (e) {
      return { state: 'VERIFICATION_UNAVAILABLE' };
    }
  }

  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void {
    const docRef = doc(db, 'entitlements', humanUserId);
    callback({ state: 'CHECKING' });
    
    return onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback({ state: 'EXPIRED' });
      } else {
        callback(this.mapData(snapshot.data()));
      }
    }, (error) => {
      callback({ state: 'VERIFICATION_UNAVAILABLE' });
    });
  }

  private mapData(data: any): Entitlement {
    const state = data.state as EntitlementState;
    if (['ACTIVE_TRIAL', 'ACTIVE_SUBSCRIPTION', 'EXPIRED'].includes(state)) {
      return { state };
    }
    return { state: 'EXPIRED' };
  }
}

export const entitlementRepository = new FirebaseEntitlementRepository();
