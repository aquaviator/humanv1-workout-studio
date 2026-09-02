import { doc, getDoc, Timestamp } from 'firebase/firestore';
import { Entitlement, EntitlementRepository } from '../domain/entitlement';
import { auth, db } from '../config/firebase';
import * as idb from 'idb-keyval';

interface CurrentProjection {
  schemaVersion: 1;
  firebaseUid: string;
  humanUserId: string;
  normalizedState: 'ACTIVE_UNTIL_EXPIRY' | 'EXPIRED' | 'REVOKED' | 'UNENTITLED';
  productScope: 'WORKOUT_STUDIO';
  source: 'SUPPORT' | 'INTRODUCTORY';
  expiryAt: Timestamp;
  offlineReceiptValidUntil: Timestamp;
  introductoryState?: 'EXPIRED';
  introductoryExpiredAt?: Timestamp;
  products?: Record<string, {
    normalizedState: CurrentProjection['normalizedState']; source: CurrentProjection['source'];
    expiryAt: Timestamp; offlineReceiptValidUntil: Timestamp;
  }>;
}

interface EntitlementReceipt {
  schemaVersion: 2;
  authUid: string;
  humanUserId: string;
  state: CurrentProjection['normalizedState'];
  source: CurrentProjection['source'];
  expiresAtMillis: number;
  offlineValidUntilMillis: number;
  introductoryState?: 'EXPIRED';
  introductoryExpiredAtMillis?: number;
}

type ProjectionLoader = (uid: string) => Promise<CurrentProjection>;
const loadProjection: ProjectionLoader = async uid => {
  const snapshot = await getDoc(doc(db, 'accounts', uid, 'entitlements', 'current'));
  if (!snapshot.exists()) throw new Error('Current entitlement projection is absent');
  return snapshot.data() as CurrentProjection;
};

export class FirebaseEntitlementRepository implements EntitlementRepository {
  constructor(private readonly loader: ProjectionLoader = loadProjection, private readonly now: () => number = Date.now) {}
  private getCacheKey(humanUserId: string) { return `entitlement_receipt_${humanUserId}`; }

  async getEntitlement(humanUserId: string): Promise<Entitlement> {
    const user = auth.currentUser;
    if (!user) return { state: 'VERIFICATION_UNAVAILABLE' };
    try {
      const receipt = this.toReceipt(await this.loader(user.uid), humanUserId, user.uid);
      await idb.set(this.getCacheKey(humanUserId), receipt);
      return this.checkValidity(receipt);
    } catch {
      const cached = await idb.get<EntitlementReceipt>(this.getCacheKey(humanUserId));
      if (cached?.schemaVersion === 2 && cached.authUid === user.uid && cached.humanUserId === humanUserId) return this.checkValidity(cached);
      return { state: 'VERIFICATION_UNAVAILABLE' };
    }
  }

  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void {
    let cancelled = false;
    callback({ state: 'CHECKING' });
    void this.getEntitlement(humanUserId).then(value => { if (!cancelled) callback(value); });
    return () => { cancelled = true; };
  }

  private toReceipt(value: CurrentProjection, humanUserId: string, authUid: string): EntitlementReceipt {
    if (value.schemaVersion !== 1 || value.firebaseUid !== authUid || value.humanUserId !== humanUserId) throw new Error('Entitlement projection mismatch');
    const product = value.products?.WORKOUT_STUDIO ?? (value.productScope === 'WORKOUT_STUDIO' ? value : undefined);
    if (!product) throw new Error('Workout Studio entitlement is absent');
    const expiresAtMillis = product.expiryAt?.toMillis?.();
    const offlineValidUntilMillis = product.offlineReceiptValidUntil?.toMillis?.();
    if (!Number.isFinite(expiresAtMillis) || !Number.isFinite(offlineValidUntilMillis)) throw new Error('Malformed entitlement expiry');
    return { schemaVersion: 2, authUid, humanUserId, state: product.normalizedState, source: product.source, expiresAtMillis, offlineValidUntilMillis, introductoryState: value.introductoryState, introductoryExpiredAtMillis: value.introductoryExpiredAt?.toMillis?.() };
  }

  private checkValidity(receipt: EntitlementReceipt): Entitlement {
    const details = { source: receipt.source, expiresAt: new Date(receipt.expiresAtMillis).toISOString(), introductoryState: receipt.introductoryState, introductoryExpiredAt: receipt.introductoryExpiredAtMillis ? new Date(receipt.introductoryExpiredAtMillis).toISOString() : undefined };
    if (receipt.state !== 'ACTIVE_UNTIL_EXPIRY') return { state: receipt.state, ...details };
    const now = this.now();
    if (now >= receipt.expiresAtMillis) return { state: 'EXPIRED', ...details };
    if (now > receipt.offlineValidUntilMillis) return { state: 'VERIFICATION_UNAVAILABLE', ...details };
    return { state: 'ACTIVE_UNTIL_EXPIRY', ...details };
  }
}

export const entitlementRepository = new FirebaseEntitlementRepository();
