import { compileProtocolTimeline, PublishedEnvelope } from "../../domain/publication";
import { syncManager, SyncRecord } from "../../repositories/SyncManager";
import { useParams } from "react-router";
import React, { useState, useEffect, useMemo } from "react";
import { v4 as uuidv4 } from "uuid";
import { Protocol, ProtocolSegment } from "../../domain/types";
import { publicationRepository } from "../../repositories/PublicationRepository";
import { Send } from "lucide-react";
import { Plus, Trash2, Undo2, Redo2, AlertCircle } from "lucide-react";
import { useHistory } from "../../lib/useHistory";
import { draftRepository } from "../../repositories/DraftRepository";
import { HumanIdentity } from "../../domain/identity";
import { validateProtocol } from "../../domain/validation/protocolValidation";
import { AthleteProtocolPreview } from "../components/AthleteProtocolPreview";

export default function ProtocolBuilder({ identity }: { identity: HumanIdentity }) {
  const { protocolId: routeProtocolId } = useParams<{ protocolId: string }>();
  const [protocolId] = useState(() => routeProtocolId || uuidv4());
  
  const initialProtocol: Protocol = {
    protocolId,
    schemaVersion: "humanv1.protocol/1",
    title: "New HIIT Protocol",
    protocolType: "TABATA",
    summary: "",
    status: "DRAFT",
    suitability: [],
    equipmentCapabilityKeys: [],
    segments: [
      { segmentId: uuidv4(), phase: "WORK", durationSeconds: 20, repeatCount: 8, exerciseSlotCount: 1, targets: [], instructions: "" },
      { segmentId: uuidv4(), phase: "REST", durationSeconds: 10, repeatCount: 8, exerciseSlotCount: 0, targets: [], instructions: "" }
    ],
    evidence: []
  };

  const { state: protocol, set: setProtocol, reset, undo, redo, canUndo, canRedo } = useHistory<Protocol>(initialProtocol);
  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"builder" | "preview">("builder");
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  
  const [syncRecord, setSyncRecord] = useState<SyncRecord | null>(null);
  const [publishStatus, setPublishStatus] = useState<string>("");

  useEffect(() => {
    if (!protocol.protocolId) return;
    const fetchStatus = async () => {
      const records = await syncManager.listPublicationSyncRecords(identity.humanUserId, 'protocol');
      const record = records.find(r => (r.envelope as PublishedEnvelope<Protocol>).sourceDraftId === protocol.protocolId);
      setSyncRecord(record || null);
    };
    fetchStatus();
    const unsub = syncManager.subscribe(fetchStatus); return () => { unsub(); };
  }, [protocol.protocolId, identity.humanUserId]);
  
  const displayPublishStatus = useMemo(() => {
    if (publishStatus) return publishStatus;
    if (!syncRecord) return "Ready";
    switch (syncRecord.status) {
      case 'QUEUED': return "Queued—will send when connected";
      case 'SENDING': return "Sending";
      case 'SYNCED': return "Available in your apps";
      case 'CONFLICT': return "Conflict";
      case 'FAILED': return "Retry required";
      default: return "";
    }
  }, [syncRecord, publishStatus]);


  const validationErrors = useMemo(() => validateProtocol(protocol), [protocol]);

  useEffect(() => {
    let mounted = true;
    if (routeProtocolId) {
      draftRepository.getProtocolDraft(identity.humanUserId, routeProtocolId).then((draft) => {
        if (!mounted) return;
        if (draft) {
          reset(draft);
        }
        setIsLoading(false);
      });
    } else {
      setIsLoading(false);
    }
    return () => { mounted = false; };
  }, [identity.humanUserId, reset, routeProtocolId]);

  useEffect(() => {
    if (isLoading) return;
    if (validationErrors.length > 0) {
      setSaveStatus("Unsaved");
      return;
    }
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      draftRepository.saveProtocolDraft(identity.humanUserId, protocol).then(() => {
        setSaveStatus("Saved");
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [protocol, identity.humanUserId, isLoading, validationErrors.length]);

  const handlePublish = async () => {
    try {
      setPublishStatus("Publishing...");
      const compiledTimeline = compileProtocolTimeline(protocol);
      await publicationRepository.publishAuthenticated('protocol', protocol.protocolId, protocol, protocol.suitability, compiledTimeline);
      setIsPublishModalOpen(false);
      setPublishStatus("");
    } catch (error: unknown) {
      setPublishStatus(`Error: ${error instanceof Error ? error.message : 'Publication failed'}`);
    }
  };

  const addSegment = (phase: ProtocolSegment["phase"]) => {
    setProtocol({
      ...protocol,
      segments: [...protocol.segments, { 
        segmentId: uuidv4(), 
        phase, 
        durationSeconds: 30, 
        repeatCount: 1, 
        exerciseSlotCount: phase === "WORK" ? 1 : 0, 
        targets: [], 
        instructions: "" 
      }]
    });
  };

  const removeSegment = (segmentId: string) => {
    setProtocol({
      ...protocol,
      segments: protocol.segments.filter(s => s.segmentId !== segmentId)
    });
  };

  const updateSegment = (segmentId: string, updates: Partial<ProtocolSegment>) => {
    setProtocol({
      ...protocol,
      segments: protocol.segments.map(s => s.segmentId === segmentId ? { ...s, ...updates } : s)
    });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-4 md:p-8 pb-4 flex flex-col md:flex-row justify-between md:items-center border-b border-hv-border gap-4">
        <div className="flex-1">
          <input
            type="text"
            className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-hv-border focus:border-hv-primary focus:outline-none py-1 w-full"
            value={protocol.title}
            onChange={(e) => setProtocol({ ...protocol, title: e.target.value })}
            aria-label="Protocol Title"
          />
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <select 
            className="bg-hv-surface-2 text-hv-text px-3 py-2 rounded-md outline-none border border-hv-border focus:border-hv-primary mr-4"
            value={protocol.protocolType}
            onChange={(e) => setProtocol({ ...protocol, protocolType: e.target.value })}
            aria-label="Protocol Type"
          >
            <option value="TABATA">Tabata</option>
            <option value="CIRCUIT">Circuit</option>
            <option value="EMOM">EMOM</option>
            <option value="AMRAP">AMRAP</option>
            <option value="CUSTOM">Custom</option>
          </select>

          <span className="text-xs text-hv-text-muted hidden md:inline-block">{saveStatus}</span>
          <button onClick={undo} disabled={!canUndo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Undo">
            <Undo2 className="w-5 h-5" />
          </button>
          <button onClick={redo} disabled={!canRedo} className="p-2 text-hv-text-muted hover:text-hv-text disabled:opacity-50" aria-label="Redo">
            <Redo2 className="w-5 h-5" />
          </button>
          <button onClick={() => setIsPublishModalOpen(true)} disabled={validationErrors.length > 0} className="bg-hv-primary text-hv-background px-4 py-2 rounded-md font-medium hover:bg-hv-primary-hover flex items-center gap-2 disabled:opacity-50">
            <Send className="w-4 h-4" /> Send protocol to my apps
          </button>
        </div>
      </div>
      {isPublishModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-hv-surface-1 p-6 rounded-xl max-w-md w-full shadow-2xl">
            <h2 className="text-xl font-bold mb-4 text-hv-text">Send protocol to my apps</h2>
            <div className="space-y-3 mb-6 text-hv-text-muted">
              <p><span className="font-semibold text-hv-text">Segments:</span> {protocol.segments.length}</p>
              <p><span className="font-semibold text-hv-text">Total intervals:</span> {protocol.segments.reduce((acc, s) => acc + s.repeatCount, 0)}</p>
              <p><span className="font-semibold text-hv-text">Compatible Destinations:</span> {protocol.suitability.join(', ') || 'None'}</p>
            </div>
                        {displayPublishStatus && displayPublishStatus !== "Ready" && <p className="mb-4 text-hv-primary">{displayPublishStatus}</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => setIsPublishModalOpen(false)} className="px-4 py-2 text-hv-text-muted hover:text-hv-text rounded">Cancel</button>
              <button onClick={handlePublish} disabled={!!publishStatus} className="px-4 py-2 bg-hv-primary text-hv-background rounded hover:bg-hv-primary-hover font-medium">Send</button>
            </div>
          </div>
        </div>
      )}
      <div className="px-4 md:px-8 border-b border-hv-border flex gap-4 pt-4">
        <button 
          className={`pb-2 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'builder' ? 'border-hv-primary text-hv-primary' : 'border-transparent text-hv-text-muted hover:text-hv-text'}`}
          onClick={() => setActiveTab('builder')}
        >
          Builder
        </button>
        <button 
          className={`pb-2 px-2 text-sm font-medium transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'preview' ? 'border-hv-primary text-hv-primary' : 'border-transparent text-hv-text-muted hover:text-hv-text'}`}
          onClick={() => setActiveTab('preview')}
        >
          Preview
          {validationErrors.length > 0 && (
            <span className="bg-hv-error text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-full">
              {validationErrors.length}
            </span>
          )}
        </button>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
        {validationErrors.length > 0 && activeTab === 'builder' && (
          <div className="max-w-2xl mx-auto mb-6 p-4 bg-hv-surface-2 border border-hv-error rounded-lg text-sm">
            <div className="flex items-center gap-2 text-hv-error font-medium mb-2">
              <AlertCircle className="w-4 h-4" />
              <span>Validation Errors</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-hv-text-muted">
              {validationErrors.map((err, idx) => (
                <li key={idx}>
                  {err.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {activeTab === 'preview' ? (
          <AthleteProtocolPreview protocol={protocol} />
        ) : (
        <div className="max-w-2xl mx-auto">
          
          <h2 className="text-xl font-bold mb-4">Timeline Segments</h2>
          
          <div className="space-y-3 mb-8">
            {protocol.segments.map((segment, index) => (
              <div key={segment.segmentId} className="flex items-center gap-4 bg-hv-surface-1 border border-hv-border p-4 rounded-lg">
                <span className="w-6 text-center font-mono text-hv-text-muted">{index + 1}</span>
                <select 
                  className="bg-transparent text-hv-text font-semibold outline-none w-32 border-b border-transparent focus:border-hv-primary pb-1"
                  value={segment.phase}
                  onChange={(e) => updateSegment(segment.segmentId, { phase: e.target.value as ProtocolSegment["phase"] })}
                  aria-label={`Phase for segment ${index + 1}`}
                >
                  <option value="WARM_UP">Warm Up</option>
                  <option value="PREP">Prep</option>
                  <option value="WORK">Work</option>
                  <option value="REST">Rest</option>
                  <option value="ACTIVE_RECOVERY">Active Recovery</option>
                  <option value="TRANSITION">Transition</option>
                  <option value="COOL_DOWN">Cooldown</option>
                </select>
                
                <div className="flex flex-col gap-2 flex-1 items-end">
                  <div className="flex justify-end items-center gap-4 w-full">
                    <div className="flex items-center bg-hv-bg rounded px-3 py-2 border border-hv-border focus-within:border-hv-primary" title="Repeats">
                      <input 
                        type="number"
                        className="bg-transparent w-10 text-right outline-none font-mono text-lg"
                        value={segment.repeatCount}
                        onChange={(e) => updateSegment(segment.segmentId, { repeatCount: Number(e.target.value) })}
                        aria-label={`Repeats for segment ${index + 1}`}
                      />
                      <span className="text-hv-text-muted ml-2">x</span>
                    </div>

                    <div className="flex items-center bg-hv-bg rounded px-3 py-2 border border-hv-border focus-within:border-hv-primary">
                      <input 
                        type="number"
                        className="bg-transparent w-16 text-right outline-none font-mono text-lg"
                        value={segment.durationSeconds}
                        onChange={(e) => updateSegment(segment.segmentId, { durationSeconds: Number(e.target.value) })}
                        aria-label={`Duration in seconds for segment ${index + 1}`}
                      />
                      <span className="text-hv-text-muted ml-2">sec</span>
                    </div>
                    
                    <button onClick={() => removeSegment(segment.segmentId)} className="p-2 text-hv-text-muted hover:text-hv-error" aria-label={`Remove segment ${index + 1}`}>
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => addSegment('WORK')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Work
            </button>
            <button onClick={() => addSegment('REST')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Rest
            </button>
            <button onClick={() => addSegment('PREP')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Prep
            </button>
            <button onClick={() => addSegment('TRANSITION')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Transition
            </button>
            <button onClick={() => addSegment('COOL_DOWN')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Cooldown
            </button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
