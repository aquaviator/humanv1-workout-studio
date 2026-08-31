import { get, set, keys, setMany } from 'idb-keyval';
import { DraftEnvelope } from './DraftRepository';
import { db } from '../config/firebase';
import { doc, runTransaction, collection, query, getDocs } from 'firebase/firestore';

export type SyncStatus = 'PENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED';

export interface SyncRecord {
  envelope: DraftEnvelope<any>;
  status: SyncStatus;
  type: 'workout' | 'plan' | 'protocol';
  lastError?: string;
  acknowledgedRevision?: number;
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

    const allKeys = await keys();
    const syncKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith('sync_'));

    for (const key of syncKeys) {
      const record = await get<SyncRecord>(key as string);
      if (record && (record.status === 'PENDING' || record.status === 'FAILED')) {
        await this.uploadRecord(key as string, record);
      }
    }
  }

  async syncDown(humanUserId: string, types: ('workout' | 'plan' | 'protocol')[] = ['workout', 'plan', 'protocol']): Promise<void> {
    if (!this.isOnline) return;

    for (const type of types) {
      const q = query(collection(db, 'users', humanUserId, `${type}Drafts`));
      const snap = await getDocs(q);
      
      const localPrefix = `drafts_${humanUserId}_${type}_`;
      const setOps: [string, any][] = [];
      
      for (const doc of snap.docs) {
        const remoteData = doc.data() as DraftEnvelope<any>;
        const localKey = `${localPrefix}${remoteData.globalId}`;
        const localData = await get<DraftEnvelope<any>>(localKey);
        
        // Exact revision handling, Replay protection
        const syncKey = `sync_${humanUserId}_${type}_${remoteData.globalId}`;
        const syncRecord = await get<SyncRecord>(syncKey);
        if (syncRecord?.status === 'PENDING' || syncRecord?.status === 'FAILED') {
          if (remoteData.revision >= syncRecord.envelope.revision) {
            syncRecord.status = 'CONFLICT';
            syncRecord.lastError = 'REMOTE_CHANGED_WHILE_LOCAL_PENDING';
            setOps.push([syncKey, syncRecord]);
          }
        } else if (!localData || remoteData.revision > localData.revision) {
          setOps.push([localKey, remoteData]);
          if (syncRecord && syncRecord.envelope.revision < remoteData.revision) {
             syncRecord.status = 'SYNCED';
             syncRecord.acknowledgedRevision = remoteData.revision;
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
    const { envelope, type } = record;
    const docRef = doc(db, 'users', envelope.humanUserId, `${type}Drafts`, envelope.globalId);

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
            if (JSON.stringify(remoteData) !== JSON.stringify(envelope)) throw new Error('REVISION_COLLISION');
            return;
          }
        }
        transaction.set(docRef, envelope);
      });

      // On success
      record.status = 'SYNCED';
      record.acknowledgedRevision = envelope.revision;
      delete record.lastError;
      await set(key, record);
    } catch (e: any) {
      console.error("Sync upload failed", e);
      if (e.message === 'REVISION_CONFLICT' || e.message === 'OWNERSHIP_CONFLICT' || e.message === 'REVISION_COLLISION') {
        record.status = 'CONFLICT';
        record.lastError = e.message;
      } else {
        record.status = 'FAILED';
        record.lastError = e instanceof Error ? e.message : 'UPLOAD_FAILED';
      }
      await set(key, record);
    }
  }
}

export const syncManager = new SyncManager();
