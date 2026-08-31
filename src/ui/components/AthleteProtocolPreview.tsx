import React, { useMemo } from 'react';
import { Protocol } from "../../domain/types";

export function AthleteProtocolPreview({ protocol }: { protocol: Protocol }) {
  const compiledTimeline = useMemo(() => {
    const unrolled = [];
    let globalTime = 0;
    
    for (const segment of protocol.segments) {
      for (let i = 0; i < segment.repeatCount; i++) {
        unrolled.push({
          ...segment,
          iteration: i + 1,
          startTime: globalTime,
        });
        globalTime += segment.durationSeconds;
      }
    }
    return { unrolled, totalTime: globalTime };
  }, [protocol]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto py-8">
      <div className="mb-8 border-b border-hv-border pb-4">
        <h2 className="text-3xl font-bold">{protocol.title}</h2>
        <div className="text-hv-text-muted text-sm mt-2">
          Type: {protocol.protocolType} &bull; Total Time: {formatTime(compiledTimeline.totalTime)}
        </div>
      </div>

      <div className="space-y-2">
        {compiledTimeline.unrolled.map((segment, idx) => (
          <div key={`${segment.segmentId}-${idx}`} className="flex items-center gap-4 py-2 border-b border-hv-border border-dashed">
            <div className="w-16 font-mono text-hv-text-muted text-sm text-right">
              {formatTime(segment.startTime)}
            </div>
            <div className="flex-1">
              <span className={`font-semibold ${segment.phase === 'WORK' ? 'text-hv-primary' : 'text-hv-text'}`}>
                {segment.phase}
              </span>
              {segment.repeatCount > 1 && (
                <span className="text-xs text-hv-text-muted ml-2">
                  (Round {segment.iteration} of {segment.repeatCount})
                </span>
              )}
            </div>
            <div className="w-16 font-mono text-sm">
              {segment.durationSeconds}s
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
