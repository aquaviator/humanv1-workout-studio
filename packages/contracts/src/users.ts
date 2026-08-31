export interface UserSummary {
  humanUserId: string;
  firebaseUid: string;
  email: string; // Masked if necessary
  displayName: string;
  createdAt: string;
  lastSignIn: string;
  status: 'ACTIVE' | 'DISABLED';
  effectiveEntitlement: string;
}
