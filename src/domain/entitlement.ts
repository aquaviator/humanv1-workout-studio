export type EntitlementState = 'CHECKING' | 'TRIAL_ACTIVE' | 'ACTIVE' | 'CANCELLED_ACTIVE' | 'GRACE_PERIOD' | 'ACCOUNT_HOLD' | 'PAUSED' | 'PENDING' | 'EXPIRED' | 'REVOKED' | 'VERIFICATION_UNAVAILABLE';

export interface Entitlement {
  state: EntitlementState;
}

export interface EntitlementRepository {
  getEntitlement(humanUserId: string): Promise<Entitlement>;
  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void;
}
