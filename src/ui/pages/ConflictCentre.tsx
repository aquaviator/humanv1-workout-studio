import React, { useState, useEffect } from "react";
import { HumanIdentity } from "../../domain/identity";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";
import { draftRepository } from "../../repositories/DraftRepository";
import { AlertCircle, RefreshCw, UploadCloud, DownloadCloud } from "lucide-react";
import { formatUserDate } from "../../domain/presentation";
import { v4 as uuidv4 } from "uuid";
import { Plan, Protocol, Workout } from "../../domain/types";

export default function ConflictCentre({ identity }: { identity: HumanIdentity }) {
  const [conflicts, setConflicts] = useState<SyncRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const loadConflicts = async () => {
    setIsLoading(true);
    const wRecords = await syncManager.listSyncRecords(identity.humanUserId, 'workout');
    const pRecords = await syncManager.listSyncRecords(identity.humanUserId, 'plan');
    const ptRecords = await syncManager.listSyncRecords(identity.humanUserId, 'protocol');
    
    const allConflicts = [...wRecords, ...pRecords, ...ptRecords].filter(r => r.status === 'CONFLICT' || r.status === 'NEEDS_USER_REVIEW');
    setConflicts(allConflicts);
    setIsLoading(false);
  };

  useEffect(() => {
    loadConflicts();
  }, [identity.humanUserId]);

  const handleDiscardLocal = async (record: SyncRecord) => {
    if (!window.confirm("Keep the newer cloud version? Your preserved Studio changes will remain in the synchronization audit.")) {
      return;
    }
    try {
      await syncManager.resolveWithRemote(identity.humanUserId, record);
      await loadConflicts();
    } catch (e) {
      alert("Studio could not keep the newer cloud version safely: " + (e as Error).message);
    }
  };

  const handleCreateCopy = async (record: SyncRecord) => {
    try {
      const payload = structuredClone(record.envelope.payload);
      const newId = uuidv4();
      if (record.type === 'workout') await draftRepository.saveWorkoutDraft(identity.humanUserId, { ...(payload as Workout), workoutId: newId, title: `${payload.title} (Preserved copy)` });
      if (record.type === 'plan') await draftRepository.savePlanDraft(identity.humanUserId, { ...(payload as Plan), planId: newId, title: `${payload.title} (Preserved copy)` });
      if (record.type === 'protocol') await draftRepository.saveProtocolDraft(identity.humanUserId, { ...(payload as Protocol), protocolId: newId, title: `${payload.title} (Preserved copy)` });
      await syncManager.resolveWithRemote(identity.humanUserId, record);
      await loadConflicts();
    } catch (e) {
      alert("Studio could not create the preserved copy safely: " + (e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Issues needing attention</h1>
          <p className="text-hv-text-muted mt-1 text-sm">Review changes that Studio will not resolve automatically.</p>
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
                  <span className="font-semibold">{conflict.attention ? "Content needs attention" : "Newer edits need attention"}</span>
                </div>
                <div className="text-hv-text">
                  <span className="capitalize font-medium">{conflict.type}</span>: {conflict.envelope.payload.title || "Untitled"}
                </div>
                <div className="text-xs text-hv-text-muted font-mono flex flex-wrap gap-4">
                  <span>ID: {conflict.envelope.globalId.substring(0,8)}...</span>
                  <span>Local Rev: {conflict.envelope.revision}</span>
                  <span>Updated: {formatUserDate(conflict.envelope.updatedAt, true)}</span>
                </div>
                <p id={`issue-${idx}`} className="text-sm text-hv-text-muted">{conflict.attention?.explanation ?? `This ${conflict.type} changed elsewhere after this browser saved its copy. Your changes have been preserved, but Studio will not overwrite the newer version.`}</p>
                {conflict.attention && <p className="text-sm text-hv-text-muted">{conflict.attention.correctiveAction}</p>}
                {reviewing === `${conflict.type}-${conflict.envelope.globalId}` && <details open className="text-xs text-hv-text-muted"><summary>Technical details</summary><div>Local revision {conflict.envelope.revision}; reason {conflict.attention?.technicalCode ?? conflict.lastErrorCode ?? 'not recorded'}.</div></details>}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <button 
                  onClick={() => handleDiscardLocal(conflict)}
                  className="px-4 py-2 text-sm bg-hv-surface-2 border border-hv-border hover:bg-hv-border rounded flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                >
                  <DownloadCloud className="w-4 h-4" />
                  Keep newer cloud version
                </button>
                <button
                  onClick={() => setReviewing(`${conflict.type}-${conflict.envelope.globalId}`)}
                  aria-describedby={`issue-${idx}`}
                  className="px-4 py-2 text-sm bg-hv-surface-2 border border-hv-border rounded flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                >
                  Review differences
                </button>
                <button 
                  onClick={() => handleCreateCopy(conflict)}
                  aria-describedby={`issue-${idx}`}
                  className="px-4 py-2 text-sm bg-hv-primary hover:bg-hv-primary-hover text-white rounded flex items-center justify-center gap-2 transition-colors w-full sm:w-auto"
                >
                  <UploadCloud className="w-4 h-4" />
                  Create a copy from my preserved changes
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
