import React, { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Protocol } from "../../domain/types";
import { Plus, Trash2, Undo2, Redo2 } from "lucide-react";
import { useHistory } from "../../lib/useHistory";
import { HumanIdentity } from "../../domain/identity";

export default function ProtocolBuilder({ identity }: { identity: HumanIdentity }) {
  const [protocolId] = useState(() => uuidv4());
  
  const { state: protocol, set: setProtocol, undo, redo, canUndo, canRedo } = useHistory<any>({
    protocolId,
    schemaVersion: "humanv1.protocol/1",
    title: "New HIIT Protocol",
    protocolType: "TABATA",
    summary: "",
    suitability: [],
    tags: [],
    timeline: {
      totalDurationSeconds: 240,
      repeats: 8,
      segments: [
        { segmentId: uuidv4(), type: "WORK", durationSeconds: 20 },
        { segmentId: uuidv4(), type: "RECOVERY", durationSeconds: 10 }
      ]
    }
  });

  const [saveStatus, setSaveStatus] = useState<"Saved" | "Saving..." | "Unsaved">("Saved");

  const addSegment = (type: "PREP" | "WORK" | "RECOVERY" | "TRANSITION" | "COOLDOWN") => {
    setProtocol({
      ...protocol,
      timeline: {
        ...protocol.timeline,
        segments: [...protocol.timeline.segments, { segmentId: uuidv4(), type, durationSeconds: 30 }]
      }
    });
  };

  const removeSegment = (segmentId: string) => {
    setProtocol({
      ...protocol,
      timeline: {
        ...protocol.timeline,
        segments: protocol.timeline.segments.filter((s: any) => s.segmentId !== segmentId)
      }
    });
  };

  const updateSegment = (segmentId: string, durationSeconds: number) => {
    setProtocol({
      ...protocol,
      timeline: {
        ...protocol.timeline,
        segments: protocol.timeline.segments.map((s: any) => s.segmentId === segmentId ? { ...s, durationSeconds } : s)
      }
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
          
          <div className="flex justify-between items-center bg-hv-surface-1 p-4 rounded-lg border border-hv-border mb-6">
            <div className="font-semibold text-hv-text-muted">Total Rounds / Repeats</div>
            <div className="flex items-center gap-2 bg-hv-bg px-3 py-1 rounded border border-hv-border">
              <input 
                type="number"
                className="bg-transparent w-16 text-xl text-center outline-none font-bold"
                value={protocol.timeline.repeats || 1}
                onChange={(e) => setProtocol({ ...protocol, timeline: { ...protocol.timeline, repeats: Number(e.target.value) }})}
              />
              <span className="text-sm text-hv-text-muted">x</span>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-4">Timeline Segments</h2>
          
          <div className="space-y-3 mb-8">
            {protocol.timeline.segments.map((segment: any, index: number) => (
              <div key={segment.segmentId} className="flex items-center gap-4 bg-hv-surface-1 border border-hv-border p-4 rounded-lg">
                <span className="w-6 text-center font-mono text-hv-text-muted">{index + 1}</span>
                <select 
                  className="bg-transparent text-hv-text font-semibold outline-none w-32 border-b border-transparent focus:border-hv-primary pb-1"
                  value={segment.type}
                  onChange={(e) => {
                    const updated = [...protocol.timeline.segments];
                    updated[index].type = e.target.value;
                    setProtocol({ ...protocol, timeline: { ...protocol.timeline, segments: updated } });
                  }}
                >
                  <option value="PREP">Prep</option>
                  <option value="WORK">Work</option>
                  <option value="RECOVERY">Recovery</option>
                  <option value="TRANSITION">Transition</option>
                  <option value="COOLDOWN">Cooldown</option>
                </select>
                
                <div className="flex-1 flex justify-end items-center gap-4">
                  <div className="flex items-center bg-hv-bg rounded px-3 py-2 border border-hv-border focus-within:border-hv-primary">
                    <input 
                      type="number"
                      className="bg-transparent w-16 text-right outline-none font-mono text-lg"
                      value={segment.durationSeconds}
                      onChange={(e) => updateSegment(segment.segmentId, Number(e.target.value))}
                    />
                    <span className="text-hv-text-muted ml-2">sec</span>
                  </div>
                  
                  <button onClick={() => removeSegment(segment.segmentId)} className="p-2 text-hv-text-muted hover:text-hv-error">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => addSegment('WORK')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Work
            </button>
            <button onClick={() => addSegment('RECOVERY')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2">
              <Plus className="w-4 h-4" /> Recovery
            </button>
            <button onClick={() => addSegment('PREP')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Prep
            </button>
            <button onClick={() => addSegment('TRANSITION')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Transition
            </button>
            <button onClick={() => addSegment('COOLDOWN')} className="px-4 py-2 bg-hv-surface-2 hover:bg-hv-surface-1 border border-hv-border rounded-md text-sm font-medium flex items-center gap-2 text-hv-text-muted">
              <Plus className="w-4 h-4" /> Cooldown
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
