import React, { useState, useEffect } from "react";
import { HumanIdentity } from "../../domain/identity";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";
import { draftRepository } from "../../repositories/DraftRepository";
import { AlertCircle, RefreshCw, UploadCloud, DownloadCloud, Trash2 } from "lucide-react";
import { db } from "../../config/firebase";
import { doc, getDoc } from "firebase/firestore";
import { set, del } from "idb-keyval";

export default function ConflictCentre({ identity }: { identity: HumanIdentity }) {
  const [conflicts, setConflicts] = useState<SyncRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadConflicts = async () => {
    setIsLoading(true);
    const wRecords = await syncManager.listSyncRecords(identity.humanUserId, 'workout');
    const pRecords = await syncManager.listSyncRecords(identity.humanUserId, 'plan');
    const ptRecords = await syncManager.listSyncRecords(identity.humanUserId, 'protocol');
    
    const allConflicts = [...wRecords, ...pRecords, ...ptRecords].filter(r => r.status === 'CONFLICT');
    setConflicts(allConflicts);
    setIsLoading(false);
  };

  useEffect(() => {
    loadConflicts();
  }, [identity.humanUserId]);

  const handleDiscardLocal = async (record: SyncRecord) => {
    if (!window.confirm("Are you sure you want to discard local changes and use the remote version? This cannot be undone.")) {
      return;
    }
    try {
      const docRef = doc(db, 'users', identity.humanUserId, `${record.type}Drafts`, record.envelope.globalId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const remoteData = snap.data();
        const localKey = `drafts_${identity.humanUserId}_${record.type}_${record.envelope.globalId}`;
        await set(localKey, remoteData);
      } else {
        const localKey = `drafts_${identity.humanUserId}_${record.type}_${record.envelope.globalId}`;
        await del(localKey);
      }
      
      const syncKey = `sync_${identity.humanUserId}_${record.type}_${record.envelope.globalId}`;
      await del(syncKey);
      await loadConflicts();
    } catch (e) {
      alert("Failed to discard local changes: " + (e as Error).message);
    }
  };

  const handleForceOverwrite = async (record: SyncRecord) => {
    if (!window.confirm("Are you sure you want to force overwrite the remote version? This will overwrite changes made on another device.")) {
      return;
    }
    try {
      const docRef = doc(db, 'users', identity.humanUserId, `${record.type}Drafts`, record.envelope.globalId);
      const snap = await getDoc(docRef);
      let newRevision = record.envelope.revision + 1;
      
      if (snap.exists()) {
        const remoteData = snap.data();
        if (remoteData.humanUserId !== identity.humanUserId) {
           throw new Error("Cannot overwrite draft belonging to another user.");
        }
        newRevision = Math.max(newRevision, remoteData.revision + 1);
      }

      const updatedEnvelope = {
        ...record.envelope,
        humanUserId: identity.humanUserId,
        revision: newRevision,
        updatedAt: new Date().toISOString()
      };

      const localKey = `drafts_${identity.humanUserId}_${record.type}_${record.envelope.globalId}`;
      await set(localKey, updatedEnvelope);

      await syncManager.queueUpload(updatedEnvelope, record.type);
      await syncManager.syncPending();
      await loadConflicts();
    } catch (e) {
      alert("Failed to force overwrite: " + (e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Conflict Centre</h1>
          <p className="text-hv-text-muted mt-1 text-sm">Resolve synchronization conflicts between local and remote drafts.</p>
        </div>
        <button onClick={loadConflicts} className="p-2 border border-hv-border rounded hover:bg-hv-surface-2 transition-colors" aria-label="Refresh">
          <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {conflicts.length === 0 ? (
        <div className="text-center text-hv-text-muted py-12 bg-hv-surface-1 border border-hv-border rounded-lg">
          <p>No conflicts found. Everything is in sync.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {conflicts.map((conflict, idx) => (
            <div key={`${conflict.type}_${conflict.envelope.globalId}_${idx}`} className="bg-hv-surface-1 border border-hv-error/30 rounded-lg p-4 md:p-6 shadow-sm flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 text-hv-error">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-semibold">{conflict.lastError || "Sync Conflict"}</span>
                </div>
                <div className="text-hv-text">
                  <span className="capitalize font-medium">{conflict.type}</span>: {conflict.envelope.payload.title || "Untitled"}
                </div>
                <div className="text-xs text-hv-text-muted font-mono flex flex-wrap gap-4">
                  <span>ID: {conflict.envelope.globalId.substring(0,8)}...</span>
                  <span>Local Rev: {conflict.envelope.revision}</span>
                  <span>Updated: {new Date(conflict.envelope.updatedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <button 
                  onClick={() => handleDiscardLocal(conflict)}
                  className="px-4 py-2 text-sm bg-hv-surface-2 border border-hv-border hover:bg-hv-border rounded flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                >
                  <DownloadCloud className="w-4 h-4" />
                  Discard Local (Use Remote)
                </button>
                <button 
                  onClick={() => handleForceOverwrite(conflict)}
                  className="px-4 py-2 text-sm bg-hv-primary hover:bg-hv-primary-hover text-white rounded flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                >
                  <UploadCloud className="w-4 h-4" />
                  Force Overwrite
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
