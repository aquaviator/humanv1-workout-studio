import { get, set, keys, setMany, del } from 'idb-keyval';
import { DraftEnvelope } from './DraftRepository';
import { PublishedEnvelope } from '../domain/publication';
import { PublishableContent } from '../domain/publication';
import { db } from '../config/firebase';
import { functions } from '../config/firebase';
import { doc, runTransaction, collection, query, getDocs, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { sha256 } from 'js-sha256';
import { assertMutationAllowed, isReadOnlyAcceptanceMode } from '../config/mutationPolicy';
import type { Plan, PlanDraftDependencyRecord } from '../domain/types';

export type SyncStatus = 'QUEUED' | 'SENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED' | 'NEEDS_USER_REVIEW';
export type SyncFailureCode = 'NETWORK_OFFLINE' | 'NETWORK_RETRYABLE' | 'PERMISSION_DENIED' | 'OWNERSHIP_CONFLICT' | 'REVISION_CONFLICT' | 'REVISION_COLLISION' | 'REMOTE_CHANGED_WHILE_LOCAL_PENDING' | 'CORRUPT_PAYLOAD' | 'UPLOAD_FAILED';

export interface PlanDraftSaveRequest {
  planId: string;
  schemaVersion: 'humanv1.studio-plan-draft/1';
  create: boolean;
  expectedRevision: number | null;
  plan: Plan;
  dependencies: Array<Omit<PlanDraftDependencyRecord, 'schemaVersion' | 'humanUserId' | 'planId' | 'revision' | 'createdAt' | 'updatedAt' | 'deletedAt'>>;
  requestKey: string;
  clientOperationId: string;
  expectedContentChecksum: string;
}

interface PlanDraftSaveResult { planId: string; revision: number; contentChecksum: string; status: 'SAVED'; idempotent: boolean; dependencyCount: number; updatedAt: string }

export interface SyncRecord {
  syncType?: 'draft' | 'publication';
  envelope: DraftEnvelope<PublishableContent> | PublishedEnvelope<PublishableContent>;
  status: SyncStatus;
  type: 'workout' | 'plan' | 'protocol';
  lastErrorCode?: SyncFailureCode;
  acknowledgedRevision?: number;
  attemptCount?: number;
  lastAttemptAt?: string;
  lastCompletedAt?: string;
  auditHistory?: Array<{ at: string; status: SyncStatus; reason?: SyncFailureCode }>;
  planSave?: PlanDraftSaveRequest;
  attention?: { placementId?: string; displayName?: string; explanation: string; correctiveAction: string; contentPreserved: true; technicalCode?: string };
}

type Subscriber = () => void;

declare global {
  interface Window {
    __HV1_TEST_PAUSE_PUBLICATION_SEND__?: () => Promise<void>;
  }
}

export class SyncManager {
  private isOnline = navigator.onLine;
  private subscribers = new Set<Subscriber>();
  private syncInFlight: Promise<void> | null = null;
  private syncRequested = false;

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.syncPending();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  subscribe(callback: Subscriber) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify() {
    this.subscribers.forEach(s => s());
  }

  async queueUpload(envelope: DraftEnvelope<PublishableContent> | PublishedEnvelope<PublishableContent>, type: 'workout' | 'plan' | 'protocol', syncType: 'draft' | 'publication' = 'draft'): Promise<void> {
    assertMutationAllowed(`queueUpload:${syncType}:${type}`);
    const key = syncType === 'publication' 
      ? `sync_pub_${envelope.humanUserId}_${type}_${(envelope as PublishedEnvelope<PublishableContent>).versionId}`
      : `sync_${envelope.humanUserId}_${type}_${envelope.globalId}`;
      
    const record: SyncRecord = {
      envelope,
      syncType,
      status: 'QUEUED',
      type
    };
    await set(key, record);
    this.notify();
    
    if (this.isOnline) {
      this.syncPending();
    }
  }

  async syncPending(): Promise<void> {
    if (isReadOnlyAcceptanceMode()) return;
    if (!this.isOnline) return;
    if (this.syncInFlight) {
      this.syncRequested = true;
      return this.syncInFlight;
    }
    this.syncInFlight = (async () => {
      do {
        this.syncRequested = false;
        await this.syncPendingOnce();
      } while (this.syncRequested && this.isOnline);
    })();
    try { await this.syncInFlight; }
    finally { this.syncInFlight = null; }
  }

  async queuePlanSave(envelope: DraftEnvelope<Plan>, records: PlanDraftDependencyRecord[]): Promise<void> {
    assertMutationAllowed('queueUpload:draft:plan');
    const key = `sync_${envelope.humanUserId}_plan_${envelope.globalId}`;
    const previous = await get<SyncRecord>(key);
    const expectedRevision = previous?.planSave?.expectedRevision ?? previous?.acknowledgedRevision ?? (envelope.revision > 1 ? envelope.revision - 1 : null);
    const dependencies = records.map(({ schemaVersion: _schema, humanUserId: _owner, planId: _plan, revision: _revision,
      createdAt: _created, updatedAt: _updated, deletedAt: _deleted, ...dependency }) => dependency);
    const canonical = canonicalStringify({ schemaVersion: 'humanv1.studio-plan-draft/1', planId: envelope.globalId,
      create: expectedRevision === null, expectedRevision, plan: envelope.payload, dependencies: [...dependencies].sort((a, b) => a.dependencyId.localeCompare(b.dependencyId)) });
    const checksum = sha256(canonical);
    const planSave: PlanDraftSaveRequest = { planId: envelope.globalId, schemaVersion: 'humanv1.studio-plan-draft/1', create: expectedRevision === null,
      expectedRevision, plan: envelope.payload, dependencies, requestKey: checksum, clientOperationId: envelope.originClientId, expectedContentChecksum: checksum };
    // Retire any locally queued records produced by the former split-write path.
    // They are never sent independently; the complete manifest above is durable.
    for (const staleKey of (await keys()).filter((item): item is string => typeof item === 'string' && item.startsWith(`sync_dependency_${envelope.humanUserId}_${envelope.globalId}_`))) await del(staleKey);
    await set(key, { envelope, syncType: 'draft', status: 'QUEUED', type: 'plan', planSave } satisfies SyncRecord);
    this.notify();
    if (this.isOnline) this.syncPending();
  }

  private async syncPendingOnce(): Promise<void> {
    const allKeys = await keys();
    const priority = (key: string) => key.startsWith('sync_pub_')
      ? key.includes('_workout_') ? 0 : key.includes('_protocol_') ? 1 : key.includes('_plan_') ? 2 : 3
      : key.includes('_workout_') ? 4 : key.includes('_protocol_') ? 5 : key.includes('_plan_') ? 6 : 7;
    // IndexedDB key enumeration is not a publication contract. Always make immutable
    // workout dependencies durable before the plan envelope that names them.
    const syncKeys = allKeys.filter((k): k is string => typeof k === 'string' && k.startsWith('sync_') && !k.startsWith('sync_dependency_'))
      .sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
    for (const key of syncKeys) {
      const record = await get<SyncRecord>(key);
      if (record && (record.status === 'QUEUED' || record.status === 'FAILED')) {
        if (record.syncType === 'publication' && record.type === 'plan') {
          const dependencies = (record.envelope as PublishedEnvelope<PublishableContent>).payload as { workoutVersionIds?: string[] };
          const blocked = await Promise.all((dependencies.workoutVersionIds ?? []).map(async versionId => {
            const dependency = await get<SyncRecord>(`sync_pub_${record.envelope.humanUserId}_workout_${versionId}`);
            return dependency != null && dependency.status !== 'SYNCED';
          }));
          if (blocked.some(Boolean)) continue;
        }
        await this.uploadRecord(key, record);
      }
    }
  }

  async syncDown(humanUserId: string, types: ('workout' | 'plan' | 'protocol')[] = ['workout', 'plan', 'protocol']): Promise<void> {
    if (!this.isOnline) return;
    for (const type of types) {
      const q = query(collection(db, 'users', humanUserId, `${type}Drafts`));
      const snap = await getDocs(q);
      
      const localPrefix = `drafts_${humanUserId}_${type}_`;
      const setOps: [string, SyncRecord | DraftEnvelope<PublishableContent>][] = [];
      
      for (const doc of snap.docs) {
        const remoteData = doc.data() as DraftEnvelope<PublishableContent>;
        const localKey = `${localPrefix}${remoteData.globalId}`;
        const localData = await get<DraftEnvelope<PublishableContent>>(localKey);
        
        const syncKey = `sync_${humanUserId}_${type}_${remoteData.globalId}`;
        const syncRecord = await get<SyncRecord>(syncKey);

        if (syncRecord?.status === 'QUEUED' || syncRecord?.status === 'FAILED' || syncRecord?.status === 'SENDING') {
          if (isReadOnlyAcceptanceMode()) continue;
          if (remoteData.revision >= syncRecord.envelope.revision) {
            syncRecord.status = 'NEEDS_USER_REVIEW';
            syncRecord.lastErrorCode = 'REMOTE_CHANGED_WHILE_LOCAL_PENDING';
            const auditEntry: NonNullable<SyncRecord['auditHistory']>[number] = {
              at: new Date().toISOString(), status: 'NEEDS_USER_REVIEW', reason: 'REMOTE_CHANGED_WHILE_LOCAL_PENDING',
            };
            syncRecord.auditHistory = [...(syncRecord.auditHistory ?? []), auditEntry].slice(-20);
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
        await setMany(setOps);
        this.notify();
      }
    }
  }

  private async uploadRecord(key: string, record: SyncRecord) {
    assertMutationAllowed(`uploadRecord:${record.syncType ?? 'draft'}:${record.type}`);
    const { envelope, type } = record;
    const isPub = record.syncType === 'publication';
    const collectionName = isPub ? `published${type.charAt(0).toUpperCase() + type.slice(1)}s` : `${type}Drafts`;
    const docId = isPub ? (envelope as PublishedEnvelope<PublishableContent>).versionId : envelope.globalId;
    const docRef = doc(db, 'users', envelope.humanUserId, collectionName, docId);

    record.status = 'SENDING';
    record.attemptCount = (record.attemptCount ?? 0) + 1;
    record.lastAttemptAt = new Date().toISOString();
    await set(key, record);
    this.notify();

    try {
      // Vite removes this entire test hook from production builds because the
      // condition is a compile-time false literal at the release boundary.
      if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && isPub) {
        await window.__HV1_TEST_PAUSE_PUBLICATION_SEND__?.();
      }
      if (!isPub && type === 'plan') {
        if (!record.planSave) throw new Error('CORRUPT_PAYLOAD');
        const response = await httpsCallable<PlanDraftSaveRequest, PlanDraftSaveResult>(functions, 'saveStudioPlanDraft')(record.planSave);
        const result = response.data;
        const authoritative = { ...envelope, revision: result.revision, updatedAt: result.updatedAt } as DraftEnvelope<PublishableContent>;
        record.envelope = authoritative;
        record.planSave.expectedRevision = result.revision;
        record.acknowledgedRevision = result.revision;
        await set(`drafts_${envelope.humanUserId}_plan_${envelope.globalId}`, authoritative);
      } else await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        if (snapshot.exists()) {
          const remoteData = snapshot.data() as DraftEnvelope<PublishableContent> | PublishedEnvelope<PublishableContent>;
          
          if (remoteData.humanUserId !== envelope.humanUserId) {
            throw new Error("OWNERSHIP_CONFLICT");
          }
          
          if (remoteData.revision > envelope.revision) {
            throw new Error("REVISION_CONFLICT");
          } else if (remoteData.revision === envelope.revision) {
            if (JSON.stringify(remoteData) !== JSON.stringify(envelope)) {
              throw new Error('REVISION_COLLISION');
            }
            return;
          }
        }
        transaction.set(docRef, envelope);
      });
      
      record.status = 'SYNCED';
      record.acknowledgedRevision = record.acknowledgedRevision ?? envelope.revision;
      record.lastCompletedAt = new Date().toISOString();
      delete record.lastErrorCode;
      delete record.attention;
      await set(key, record);
      this.notify();
    } catch (e: unknown) {
      let isNetworkError = false;
      let errorCode: SyncFailureCode = 'UPLOAD_FAILED';
      let isTerminal = false;

      if (e instanceof Error) {
        const firebaseCode = 'code' in e && typeof e.code === 'string' ? e.code : '';
        const normalizedFirebaseCode = firebaseCode.replace('functions/', '');
        if (e.message.includes('Connection failed') || e.message.toLowerCase().includes('offline') || normalizedFirebaseCode === 'unavailable') {
          isNetworkError = true;
          errorCode = 'NETWORK_OFFLINE';
          console.warn("Sync upload failed (expected offline/retryable): NETWORK_OFFLINE");
        } else if (normalizedFirebaseCode === 'deadline-exceeded' || normalizedFirebaseCode === 'resource-exhausted' || normalizedFirebaseCode === 'aborted') {
          errorCode = 'NETWORK_RETRYABLE';
          console.warn("Sync upload failed (expected retryable): NETWORK_RETRYABLE");
        } else if (e.message === 'OWNERSHIP_CONFLICT' || e.message === 'REVISION_CONFLICT' || e.message === 'REVISION_COLLISION' || e.message === 'CORRUPT_PAYLOAD' ||
          ['invalid-argument', 'failed-precondition', 'permission-denied', 'unauthenticated', 'not-found'].includes(normalizedFirebaseCode)) {
          errorCode = e.message === 'CORRUPT_PAYLOAD' ? 'CORRUPT_PAYLOAD' : firebaseCode.includes('permission-denied') || firebaseCode.includes('unauthenticated') ? 'PERMISSION_DENIED' : 'REVISION_CONFLICT';
          isTerminal = true;
          console.error(`Sync upload terminal conflict: ${errorCode}`);
        } else if (e.message.includes('Missing or insufficient permissions') || firebaseCode === 'permission-denied') {
          errorCode = 'PERMISSION_DENIED';
          isTerminal = true;
          console.error("Sync upload terminal failure: PERMISSION_DENIED");
        } else {
          console.error("Sync upload terminal failure: UPLOAD_FAILED");
        }
      } else {
        console.error("Sync upload terminal failure: UPLOAD_FAILED");
      }

      if (isTerminal || (!isNetworkError && errorCode === 'UPLOAD_FAILED' && (record.attemptCount ?? 0) >= 3)) {
         record.status = 'NEEDS_USER_REVIEW';
      } else {
         record.status = 'FAILED';
      }
      record.lastErrorCode = errorCode;
      if (isTerminal && e && typeof e === 'object' && 'details' in e && e.details && typeof e.details === 'object') {
        const details = e.details as Record<string, unknown>;
        record.attention = {
          ...(typeof details.placementId === 'string' ? { placementId: details.placementId } : {}),
          ...(typeof details.displayName === 'string' ? { displayName: details.displayName } : {}),
          explanation: typeof details.explanation === 'string' ? details.explanation : 'This plan could not be saved in Studio. Review the highlighted content and try again.',
          correctiveAction: typeof details.correctiveAction === 'string' ? details.correctiveAction : 'Review the plan and save it again.',
          contentPreserved: true,
          technicalCode: typeof details.reason === 'string' ? details.reason : errorCode,
        };
      }
      record.auditHistory = [...(record.auditHistory ?? []), { at: new Date().toISOString(), status: record.status, reason: errorCode }].slice(-20);
      
      await set(key, record);
      this.notify();
    }
  }

  async listSyncRecords(humanUserId: string, type: 'workout' | 'plan' | 'protocol'): Promise<SyncRecord[]> {
    const allKeys = await keys();
    const syncKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`sync_${humanUserId}_${type}_`));
    const records: SyncRecord[] = [];
    for (const key of syncKeys) {
      const record = await get<SyncRecord>(key as string);
      if (record) records.push(record);
    }
    return records;
  }

  async listPublicationSyncRecords(humanUserId: string, type: 'workout' | 'plan' | 'protocol'): Promise<SyncRecord[]> {
    const allKeys = await keys();
    const syncKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(`sync_pub_${humanUserId}_${type}_`));
    const records: SyncRecord[] = [];
    for (const key of syncKeys) {
      const record = await get<SyncRecord>(key as string);
      if (record) records.push(record);
    }
    return records;
  }

  async resolveWithRemote(humanUserId: string, record: SyncRecord): Promise<void> {
    assertMutationAllowed('resolveWithRemote');
    const remote = await getDoc(doc(db, 'users', humanUserId, `${record.type}Drafts`, record.envelope.globalId));
    const localKey = `drafts_${humanUserId}_${record.type}_${record.envelope.globalId}`;
    await set(`sync_audit_${humanUserId}_${record.type}_${record.envelope.globalId}_${Date.now()}`, {
      ...record, status: 'NEEDS_USER_REVIEW', auditHistory: [...(record.auditHistory ?? []), { at: new Date().toISOString(), status: 'NEEDS_USER_REVIEW', reason: record.lastErrorCode }].slice(-20),
    });
    if (remote.exists()) {
      const value = remote.data() as DraftEnvelope<PublishableContent>;
      if (value.humanUserId !== humanUserId) throw new Error('OWNERSHIP_CONFLICT');
      await set(localKey, value);
    } else await del(localKey);
    await del(`sync_${humanUserId}_${record.type}_${record.envelope.globalId}`);
    this.notify();
  }

  async resolveWithLocal(humanUserId: string, record: SyncRecord): Promise<void> {
    assertMutationAllowed('resolveWithLocal');
    const remote = await getDoc(doc(db, 'users', humanUserId, `${record.type}Drafts`, record.envelope.globalId));
    const remoteData = remote.exists() ? remote.data() : null;
    if (remoteData && remoteData.humanUserId !== humanUserId) throw new Error('OWNERSHIP_CONFLICT');
    const revision = Math.max(record.envelope.revision, typeof remoteData?.revision === 'number' ? remoteData.revision : 0) + 1;
    const envelope = { ...record.envelope, humanUserId, revision, updatedAt: new Date().toISOString() };
    await set(`drafts_${humanUserId}_${record.type}_${record.envelope.globalId}`, envelope);
    await this.queueUpload(envelope, record.type);
    await this.syncPending();
  }

}

function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter(key => record[key] !== undefined && key !== 'checksum').sort()
    .map(key => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`).join(',')}}`;
}

export const syncManager = new SyncManager();
