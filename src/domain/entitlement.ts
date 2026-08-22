export type EntitlementState = 'CHECKING' | 'ACTIVE_TRIAL' | 'ACTIVE_SUBSCRIPTION' | 'EXPIRED' | 'VERIFICATION_UNAVAILABLE';

export interface Entitlement {
  state: EntitlementState;
}

export interface EntitlementRepository {
  getEntitlement(humanUserId: string): Promise<Entitlement>;
  onEntitlementChanged(humanUserId: string, callback: (entitlement: Entitlement) => void): () => void;
}
