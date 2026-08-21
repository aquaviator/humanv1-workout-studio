import { AuthRepository, HumanIdentity } from '../domain/identity';

const MOCK_IDENTITY: HumanIdentity = {
  humanUserId: 'human_fixture00000000000000000000000',
  email: 'developer@humanv1.com',
  displayName: 'Local Developer',
};

const STORAGE_KEY = 'humanv1_local_auth_state';

export class LocalAuthRepository implements AuthRepository {
  private identity: HumanIdentity | null = null;
  private listeners: Set<(identity: HumanIdentity | null) => void> = new Set();

  constructor() {
    if (import.meta.env.VITE_DEV_MODE !== 'true') {
      console.error('LocalAuthRepository should only be used in development.');
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        this.identity = JSON.parse(stored);
      } catch (e) {
        this.identity = null;
      }
    }
  }

  async signIn(): Promise<void> {
    if (import.meta.env.VITE_DEV_MODE !== 'true') {
      throw new Error('Local authentication is disabled outside development environments.');
    }
    this.identity = MOCK_IDENTITY;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.identity));
    this.notifyListeners();
  }

  async signOut(): Promise<void> {
    this.identity = null;
    localStorage.removeItem(STORAGE_KEY);
    this.notifyListeners();
  }

  async getCurrentIdentity(): Promise<HumanIdentity | null> {
    return this.identity;
  }

  onAuthStateChanged(callback: (identity: HumanIdentity | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.identity);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.identity);
    }
  }
}

export const authRepository = new LocalAuthRepository();
