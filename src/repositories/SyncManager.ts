import { get, set, keys, setMany } from 'idb-keyval';
import { DraftEnvelope } from './DraftRepository';
import { db } from '../config/firebase';
import { env } from '../config/env';
import { doc, runTransaction, collection, query, getDocs } from 'firebase/firestore';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface SyncRecord {
  envelope: DraftEnvelope<any>;
  status: SyncStatus;
  type: 'workout' | 'plan' | 'protocol';
}

export class SyncManager {
  private isOnline = navigator.onLine;

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPending();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async queueUpload(envelope: DraftEnvelope<any>, type: 'workout' | 'plan' | 'protocol'): Promise<void> {
    const key = `sync_${envelope.humanUserId}_${type}_${envelope.globalId}`;
    const record: SyncRecord = {
      envelope,
      status: 'PENDING',
      type
    };
    await set(key, record);
    
    if (this.isOnline) {
      this.syncPending();
    }
  }

  async syncPending(): Promise<void> {
    if (!this.isOnline) return;
    if (env.firebase.apiKey === '' && !env.useEmulator) return;

    const allKeys = await keys();
    const syncKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('sync_'));

    for (const key of syncKeys) {
      const record = await get<SyncRecord>(key as string);
      if (record && record.status === 'PENDING') {
        await this.uploadRecord(key as string, record);
      }
    }
  }

  async syncDown(humanUserId: string, types: ('workout' | 'plan' | 'protocol')[] = ['workout', 'plan', 'protocol']): Promise<void> {
    if (!this.isOnline) return;
    if (env.firebase.apiKey === '' && !env.useEmulator) return;

    for (const type of types) {
      const q = query(collection(db, 'humans', humanUserId, `${type}s`));
      const snap = await getDocs(q);
      
      const localPrefix = `drafts_${humanUserId}_${type}_`;
      const setOps: [string, any][] = [];
      
      for (const doc of snap.docs) {
        const remoteData = doc.data() as DraftEnvelope<any>;
        const localKey = `${localPrefix}${remoteData.globalId}`;
        const localData = await get<DraftEnvelope<any>>(localKey);
        
        // Exact revision handling, Replay protection
        if (!localData || remoteData.revision > localData.revision) {
          setOps.push([localKey, remoteData]);
          
          const syncKey = `sync_${humanUserId}_${type}_${remoteData.globalId}`;
          const syncRecord = await get<SyncRecord>(syncKey);
          if (syncRecord && syncRecord.envelope.revision < remoteData.revision) {
             syncRecord.status = 'SYNCED';
             setOps.push([syncKey, syncRecord]);
          }
        }
      }
      
      if (setOps.length > 0) {
        await setMany(setOps); // Transactional local application
      }
    }
  }

  private async uploadRecord(key: string, record: SyncRecord) {
    if (env.firebase.apiKey === '' && !env.useEmulator) return;
    const { envelope, type } = record;
    const docRef = doc(db, 'humans', envelope.humanUserId, `${type}s`, envelope.globalId);

    try {
      await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as DraftEnvelope<any>;
          // Different owner check (defensive, backend rules should also enforce)
          if (remoteData.humanUserId !== envelope.humanUserId) {
            throw new Error("OWNERSHIP_CONFLICT");
          }
          
          if (remoteData.revision > envelope.revision) {
            throw new Error("REVISION_CONFLICT");
          } else if (remoteData.revision === envelope.revision) {
            // Already uploaded, idempotent
            return;
          }
        }
        transaction.set(docRef, envelope);
      });

      // On success
      record.status = 'SYNCED';
      await set(key, record);
    } catch (e: any) {
      console.error("Sync upload failed", e);
      if (e.message === 'REVISION_CONFLICT' || e.message === 'OWNERSHIP_CONFLICT') {
        record.status = 'CONFLICT';
        await set(key, record);
      } else {
        // Network or other error, stay pending
        record.status = 'FAILED'; 
        // We will retry on next online event
      }
    }
  }
}

export const syncManager = new SyncManager();
