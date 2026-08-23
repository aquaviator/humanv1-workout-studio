import { Entitlement, EntitlementRepository, EntitlementState } from '../domain/entitlement';
import { auth, db } from '../config/firebase';
import { doc, getDoc, onSnapshot, Timestamp } from 'firebase/firestore';
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
      const account = await getDoc(doc(db, 'accounts', authUid));
      if (!account.exists() || account.data().humanUserId !== humanUserId || account.data().status !== 'ACTIVE') return { state: 'EXPIRED' };
      const docRef = doc(db, 'accounts', authUid, 'entitlements', 'current');
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) {
        return { state: 'EXPIRED' };
      }
      const data = snapshot.data();
      const receipt: EntitlementReceipt = {
        humanUserId,
        authUid,
        state: this.mapState(data.state),
        expiresAt: this.toIso(data.expiresAt),
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
    const authUidAtSubscribe = auth.currentUser?.uid;
    if (!authUidAtSubscribe) { callback({ state: 'EXPIRED' }); return () => undefined; }
    const docRef = doc(db, 'accounts', authUidAtSubscribe, 'entitlements', 'current');
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
          expiresAt: this.toIso(data.expiresAt),
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
    const aliases: Record<string, EntitlementState> = { ACTIVE_TRIAL: 'TRIAL_ACTIVE', ACTIVE_SUBSCRIPTION: 'ACTIVE' };
    if (typeof state === 'string' && aliases[state]) return aliases[state];
    if (['TRIAL_ACTIVE', 'ACTIVE', 'CANCELLED_ACTIVE', 'GRACE_PERIOD', 'ACCOUNT_HOLD', 'PAUSED', 'PENDING', 'EXPIRED', 'REVOKED'].includes(state)) {
      return state as EntitlementState;
    }
    return 'EXPIRED';
  }

  private toIso(value: unknown): string | null {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value && typeof (value as { toDate?: unknown }).toDate === 'function') return (value as { toDate(): Date }).toDate().toISOString();
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : null;
  }
}

export const entitlementRepository = new FirebaseEntitlementRepository();
