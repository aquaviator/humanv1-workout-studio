import { Plan, Protocol, StableId, Workout } from './types';

export type ContentType = 'workout' | 'plan' | 'protocol';
export type PublishableContent = Workout | Plan | Protocol;

export interface CompiledProtocolStep {
  segmentId: StableId;
  iteration: number;
  phase: Protocol['segments'][number]['phase'];
  durationSeconds: number;
  startTime: number;
}

export interface PublishedEnvelope<T> {
  versionId: StableId;
  globalId: StableId;
  contentType: ContentType;
  schemaVersion: string;
  humanUserId: StableId;
  revision: number;
  publicationState: 'PUBLISHED' | 'TOMBSTONED';
  sourceDraftId: StableId;
  contentChecksum: string;
  compatibleTags: string[];
  catalogueReleaseId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string;
  tombstoneState: 'ACTIVE' | 'SOFT_DELETED';
  payload: T;
  compiledTimeline?: CompiledProtocolStep[];
}

export function compileProtocolTimeline(protocol: Protocol): CompiledProtocolStep[] {
  let startTime = 0;
  const timeline: CompiledProtocolStep[] = [];
  for (const segment of protocol.segments) {
    for (let iteration = 0; iteration < segment.repeatCount; iteration += 1) {
      timeline.push({ segmentId: segment.segmentId, iteration, phase: segment.phase, durationSeconds: segment.durationSeconds, startTime });
      startTime += segment.durationSeconds;
    }
  }
  return timeline;
}
