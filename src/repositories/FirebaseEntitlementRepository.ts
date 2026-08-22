import { Entitlement, EntitlementRepository, EntitlementState } from '../domain/entitlement';
import { auth, db } from '../config/firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import * as idb from 'idb-keyval';

interface EntitlementReceipt {
  humanUserId: string;
  authUid: string;
  state: EntitlementState;
  expiresAt: string | null;
  cachedAt: string;
}

const MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class FirebaseEntitlementRepository implements EntitlementRepository {
  private getCacheKey(humanUserId: string) {
    return `entitlement_receipt_${humanUserId}`;
  }

  async getEntitlement(humanUserId: string): Promise<Entitlement> {
    const authUid = auth.currentUser?.uid;
    if (!authUid) return { state: 'EXPIRED' };

    try {
      const docRef = doc(db, 'entitlements', humanUserId);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        return { state: 'EXPIRED' };
      }
      const data = snapshot.data();
      const receipt: EntitlementReceipt = {
        humanUserId,
        authUid,
        state: this.mapState(data.state),
        expiresAt: data.expiresAt || null,
        cachedAt: new Date().toISOString()
      };
      await idb.set(this.getCacheKey(humanUserId), receipt);
      
      return this.checkValidity(receipt);
    } catch (e) {
      // Fallback to cache
      const cached = await idb.get<EntitlementReceipt>(this.getCacheKey(humanUserId));
      if (cached && cached.authUid === authUid) {
         return this.checkValidity(cached);
      }
      return { state: 'VERIFICATION_UNAVAILABLE' };
    }
  }

  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void {
    const docRef = doc(db, 'entitlements', humanUserId);
    callback({ state: 'CHECKING' });
    
    return onSnapshot(docRef, async (snapshot) => {
      const authUid = auth.currentUser?.uid;
      if (!authUid) {
        callback({ state: 'EXPIRED' });
        return;
      }
      
      if (!snapshot.exists()) {
        callback({ state: 'EXPIRED' });
      } else {
        const data = snapshot.data();
        const receipt: EntitlementReceipt = {
          humanUserId,
          authUid,
          state: this.mapState(data.state),
          expiresAt: data.expiresAt || null,
          cachedAt: new Date().toISOString()
        };
        await idb.set(this.getCacheKey(humanUserId), receipt);
        callback(this.checkValidity(receipt));
      }
    }, async (error) => {
      const authUid = auth.currentUser?.uid;
      const cached = await idb.get<EntitlementReceipt>(this.getCacheKey(humanUserId));
      if (cached && cached.authUid === authUid) {
         callback(this.checkValidity(cached));
      } else {
        callback({ state: 'VERIFICATION_UNAVAILABLE' });
      }
    });
  }

  private checkValidity(receipt: EntitlementReceipt): Entitlement {
    const now = new Date().getTime();
    if (receipt.expiresAt && new Date(receipt.expiresAt).getTime() < now) {
      return { state: 'EXPIRED' };
    }
    const cachedTime = new Date(receipt.cachedAt).getTime();
    if (now - cachedTime > MAX_OFFLINE_MS) {
       return { state: 'EXPIRED' };
    }
    return { state: receipt.state };
  }

  private mapState(state: any): EntitlementState {
    if (['ACTIVE_TRIAL', 'ACTIVE_SUBSCRIPTION', 'EXPIRED'].includes(state)) {
      return state as EntitlementState;
    }
    return 'EXPIRED';
  }
}

export const entitlementRepository = new FirebaseEntitlementRepository();
