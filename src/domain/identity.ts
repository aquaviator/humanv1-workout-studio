export interface HumanIdentity {
  humanUserId: string;
  email: string;
  displayName: string;
}

export interface AuthRepository {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getCurrentIdentity(): Promise<HumanIdentity | null>;
  onAuthStateChanged(callback: (identity: HumanIdentity | null) => void): () => void;
}
