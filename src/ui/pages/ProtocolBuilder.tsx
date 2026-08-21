import React, { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import { Protocol, ProtocolSegment } from "../../domain/types";
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { useHistory } from "../../lib/useHistory";
import { draftRepository } from "../../repositories/DraftRepository";
import { HumanIdentity } from "../../domain/identity";

export default function ProtocolBuilder({ identity }: { identity: HumanIdentity }) {
  const [protocolId] = useState(() => uuidv4());
  
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

  useEffect(() => {
    let mounted = true;
    draftRepository.listProtocolDrafts(identity.humanUserId).then((drafts) => {
      if (!mounted) return;
      if (drafts.length > 0) {
        reset(drafts[0]);
      }
      setIsLoading(false);
    });
    return () => { mounted = false; };
  }, [identity.humanUserId, reset]);

  useEffect(() => {
    if (isLoading) return;
    let timeout: ReturnType<typeof setTimeout>;
    setSaveStatus("Saving...");
    timeout = setTimeout(() => {
      draftRepository.saveProtocolDraft(identity.humanUserId, protocol).then(() => {
        setSaveStatus("Saved");
      });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [protocol, identity.humanUserId, isLoading]);

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
          <button className="bg-hv-surface-2 text-hv-text-muted px-4 py-2 rounded-md font-medium cursor-not-allowed" disabled>
            Publish
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-8 overflow-y-auto">
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
      </div>
    </div>
  );
}
