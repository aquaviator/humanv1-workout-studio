import { get, set, keys } from 'idb-keyval';
import { PublishedEnvelope } from '../domain/publication';
import { syncManager } from './SyncManager';
import { sha256 } from 'js-sha256';
import { Workout, Protocol, Plan } from '../domain/types';

export type PublishableContent = Workout | Plan | Protocol;

export class PublicationRepository {
  private getStoreKey(userId: string, type: string, versionId: string) {
    return `published_${userId}_${type}_${versionId}`;
  }

  // A helper to generate a deterministic canonical representation
  private stringifyCanonical(obj: any): string {
    if (obj === null || typeof obj !== 'object') {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return '[' + obj.map(item => this.stringifyCanonical(item)).join(',') + ']';
    }
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map(k => JSON.stringify(k) + ':' + this.stringifyCanonical(obj[k]));
    return '{' + pairs.join(',') + '}';
  }

  public async generateChecksum(payload: PublishableContent): Promise<string> {
    const str = this.stringifyCanonical(payload);
    return sha256(str);
  }

  async publish<T extends PublishableContent>(
    userId: string,
    contentType: 'workout' | 'plan' | 'protocol',
    globalId: string,
    payload: T,
    compatibleTags: string[],
    compiledTimeline?: any
  ): Promise<PublishedEnvelope<T>> {
    const checksum = await this.generateChecksum(payload);

    const allPublished = await this.listPublishedVersions<T>(userId, contentType, globalId);
    const existing = allPublished.find(v => v.contentChecksum === checksum);
    
    if (existing) {
      await syncManager.queueUpload(existing, contentType, 'publication');
      return existing;
    }

    const revision = allPublished.length > 0 ? Math.max(...allPublished.map(v => v.revision)) + 1 : 1;
    const versionId = `${globalId}_r${revision}_${checksum.substring(0, 8)}`;
    const now = new Date().toISOString();
    
    const envelope: PublishedEnvelope<T> = {
      versionId,
      globalId,
      contentType,
      schemaVersion: payload.schemaVersion || 1,
      humanUserId: userId,
      revision,
      publicationState: 'PUBLISHED',
      sourceDraftId: globalId,
      contentChecksum: checksum,
      compatibleTags,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
      payload,
      compiledTimeline
    };

    const key = this.getStoreKey(userId, contentType, versionId);
    await set(key, envelope);
    await syncManager.queueUpload(envelope, contentType, 'publication');
    return envelope;
  }

  async listPublishedVersions<T extends PublishableContent>(userId: string, type: 'workout' | 'plan' | 'protocol', globalId?: string): Promise<PublishedEnvelope<T>[]> {
    const allKeys = await keys();
    const prefix = `published_${userId}_${type}_`;
    const pubKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(prefix));
    
    const drafts: PublishedEnvelope<T>[] = [];
    for (const key of pubKeys) {
      const pub = await get<PublishedEnvelope<T>>(key as string);
      if (pub && (!globalId || pub.globalId === globalId)) {
        drafts.push(pub);
      }
    }
    return drafts.sort((a, b) => b.revision - a.revision);
  }

  async getPublishedVersion<T extends PublishableContent>(userId: string, type: 'workout' | 'plan' | 'protocol', versionId: string): Promise<PublishedEnvelope<T> | null> {
    const key = this.getStoreKey(userId, type, versionId);
    return (await get<PublishedEnvelope<T>>(key)) || null;
  }
}

export const publicationRepository = new PublicationRepository();
