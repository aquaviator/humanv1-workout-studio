import { StableId } from './types';

export interface PublishedEnvelope<T> {
  versionId: StableId;
  globalId: StableId;
  contentType: 'workout' | 'plan' | 'protocol';
  schemaVersion: number | string;
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
  tombstoneState?: 'ACTIVE' | 'SOFT_DELETED';
  payload: T;
  compiledTimeline?: any;
}
