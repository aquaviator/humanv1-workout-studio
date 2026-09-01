import { Entitlement, EntitlementRepository, EntitlementState } from '../domain/entitlement';
import { auth } from '../config/firebase';
import * as idb from 'idb-keyval';

const ACCOUNT_TRIAL_ENDPOINT = 'https://europe-west1-hv1-platform.cloudfunctions.net/initializeAccountTrial';
const MAX_OFFLINE_MS = 7 * 24 * 60 * 60 * 1000;

interface AccountTrialResponse {
  status: 'ACTIVE' | 'EXPIRED' | 'DISABLED';
  trialStartedAtMillis?: number;
  trialEndsAtMillis?: number;
  serverNowMillis: number;
}

interface EntitlementReceipt {
  schemaVersion: 1;
  humanUserId: string;
  authUid: string;
  state: Extract<EntitlementState, 'TRIAL_ACTIVE' | 'EXPIRED' | 'UNENTITLED'>;
  trialStartedAtMillis: number | null;
  expiresAtMillis: number | null;
  verifiedServerNowMillis: number;
  offlineValidUntilMillis: number;
}

type Fetcher = typeof fetch;

export class FirebaseEntitlementRepository implements EntitlementRepository {
  constructor(
    private readonly fetcher: Fetcher = fetch,
    private readonly now: () => number = Date.now,
    private readonly endpoint: string = ACCOUNT_TRIAL_ENDPOINT
  ) {}

  private getCacheKey(humanUserId: string) {
    return `entitlement_receipt_${humanUserId}`;
  }

  async getEntitlement(humanUserId: string): Promise<Entitlement> {
    const user = auth.currentUser;
    if (!user) return { state: 'VERIFICATION_UNAVAILABLE' };

    try {
      const idToken = await user.getIdToken(false);
      const response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: '{}'
      });
      if (!response.ok) throw new Error(`Trial verification returned ${response.status}`);

      const payload = await response.json() as AccountTrialResponse;
      const receipt = this.toReceipt(payload, humanUserId, user.uid);
      await idb.set(this.getCacheKey(humanUserId), receipt);
      return this.checkValidity(receipt);
    } catch {
      const cached = await idb.get<EntitlementReceipt>(this.getCacheKey(humanUserId));
      if (cached?.schemaVersion === 1 && cached.authUid === user.uid && cached.humanUserId === humanUserId) {
        return this.checkValidity(cached);
      }
      return { state: 'VERIFICATION_UNAVAILABLE' };
    }
  }

  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void {
    let cancelled = false;
    callback({ state: 'CHECKING' });
    void this.getEntitlement(humanUserId).then(entitlement => {
      if (!cancelled) callback(entitlement);
    });
    return () => { cancelled = true; };
  }

  private toReceipt(payload: AccountTrialResponse, humanUserId: string, authUid: string): EntitlementReceipt {
    if (!Number.isFinite(payload.serverNowMillis) || payload.serverNowMillis <= 0) throw new Error('Malformed server time');

    if (payload.status === 'DISABLED') {
      return {
        schemaVersion: 1, humanUserId, authUid, state: 'UNENTITLED',
        trialStartedAtMillis: null, expiresAtMillis: null,
        verifiedServerNowMillis: payload.serverNowMillis,
        offlineValidUntilMillis: payload.serverNowMillis
      };
    }

    const startedAt = payload.trialStartedAtMillis;
    const endsAt = payload.trialEndsAtMillis;
    if (!Number.isFinite(startedAt) || !Number.isFinite(endsAt) || startedAt! <= 0 || endsAt! <= startedAt!) {
      throw new Error('Malformed introductory access receipt');
    }
    const state = payload.status === 'ACTIVE' ? 'TRIAL_ACTIVE' : 'EXPIRED';
    return {
      schemaVersion: 1, humanUserId, authUid, state,
      trialStartedAtMillis: startedAt!, expiresAtMillis: endsAt!,
      verifiedServerNowMillis: payload.serverNowMillis,
      offlineValidUntilMillis: Math.min(endsAt!, payload.serverNowMillis + MAX_OFFLINE_MS)
    };
  }

  private checkValidity(receipt: EntitlementReceipt): Entitlement {
    if (receipt.state === 'EXPIRED') return { state: 'EXPIRED' };
    if (receipt.state === 'UNENTITLED') return { state: 'UNENTITLED' };

    const observedNow = Math.max(this.now(), receipt.verifiedServerNowMillis);
    if (receipt.expiresAtMillis === null || observedNow >= receipt.expiresAtMillis) return { state: 'EXPIRED' };
    if (observedNow > receipt.offlineValidUntilMillis) return { state: 'VERIFICATION_UNAVAILABLE' };
    return { state: 'TRIAL_ACTIVE' };
  }
}

export const entitlementRepository = new FirebaseEntitlementRepository();
