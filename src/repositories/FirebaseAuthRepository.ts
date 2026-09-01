import { AuthRepository, HumanIdentity } from '../domain/identity';
import { auth, db } from '../config/firebase';
import { signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged, User, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { env } from '../config/env';

export class FirebaseAuthRepository implements AuthRepository {
  private currentIdentity: HumanIdentity | null = null;
  private listeners: Set<(identity: HumanIdentity | null) => void> = new Set();
  
  constructor() {
    onAuthStateChanged(auth, async (user) => {
      this.currentIdentity = await this.resolveIdentity(user);
      this.notifyListeners();
    });
  }

  private async resolveIdentity(user: User | null): Promise<HumanIdentity | null> {
    if (!user) return null;
    
    try {
      const idDoc = await getDoc(doc(db, 'accounts', user.uid));
      if (!idDoc.exists()) {
        return null;
      }
      
      const data = idDoc.data();
      if (!data.humanUserId || typeof data.humanUserId !== 'string') {
         return null;
      }
      if (data.status !== 'ACTIVE' || data.schemaVersion !== 1) {
         return null;
      }

      const humanDoc = await getDoc(doc(db, 'users', data.humanUserId));
      if (!humanDoc.exists()) return null;
      const human = humanDoc.data();
      if (human.ownerFirebaseUid !== user.uid || human.status !== 'ACTIVE' || human.schemaVersion !== 1) return null;

      return {
        humanUserId: data.humanUserId,
        email: user.email || '',
        displayName: human.displayName || user.displayName || 'Human',
      };
    } catch (e) {
      console.warn('resolveIdentity error', e.message);
      return null;
    }
  }

  async signIn(): Promise<void> {
    if (env.useEmulator) {
      await signInWithEmailAndPassword(auth, env.emulator.authEmail, env.emulator.authPassword);
    } else {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  }

  async getCurrentIdentity(): Promise<HumanIdentity | null> {
    await auth.authStateReady();
    return this.resolveIdentity(auth.currentUser);
  }

  onAuthStateChanged(callback: (identity: HumanIdentity | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.currentIdentity);
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.currentIdentity);
    }
  }
}
