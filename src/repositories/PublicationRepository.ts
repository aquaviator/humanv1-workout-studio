import { get, set, keys } from 'idb-keyval';
import { PublishedEnvelope } from '../domain/publication';
import { syncManager } from './SyncManager';

export class PublicationRepository {
  private getStoreKey(userId: string, type: string, versionId: string) {
    return `published_${userId}_${type}_${versionId}`;
  }

  // A helper to generate a deterministic checksum
  // For simplicity, we just use stringify and a basic hash
  public async generateChecksum(payload: any): Promise<string> {
    const str = JSON.stringify(payload);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  async publish(
    userId: string,
    contentType: 'workout' | 'plan' | 'protocol',
    globalId: string,
    payload: any,
    compatibleTags: string[],
    compiledTimeline?: any
  ): Promise<PublishedEnvelope<any>> {
    const checksum = await this.generateChecksum(payload);

    // See if we already have this checksum for this globalId
    const allPublished = await this.listPublishedVersions(userId, contentType, globalId);
    const existing = allPublished.find(v => v.contentChecksum === checksum);
    
    if (existing) {
      // Publishing unchanged content twice must return the existing version
      return existing;
    }

    const versionId = `${globalId}_v${Date.now()}`;
    const now = new Date().toISOString();
    
    // Find highest revision
    const revision = allPublished.length > 0 ? Math.max(...allPublished.map(v => v.revision)) + 1 : 1;

    const envelope: PublishedEnvelope<any> = {
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

  async listPublishedVersions(userId: string, type: 'workout' | 'plan' | 'protocol', globalId?: string): Promise<PublishedEnvelope<any>[]> {
    const allKeys = await keys();
    const prefix = `published_${userId}_${type}_`;
    const pubKeys = allKeys.filter(k => typeof k === 'string' && k.startsWith(prefix));
    
    const drafts: PublishedEnvelope<any>[] = [];
    for (const key of pubKeys) {
      const pub = await get<PublishedEnvelope<any>>(key as string);
      if (pub && (!globalId || pub.globalId === globalId)) {
        drafts.push(pub);
      }
    }
    return drafts.sort((a, b) => b.revision - a.revision); // Descending by revision
  }

  async getPublishedVersion(userId: string, type: 'workout' | 'plan' | 'protocol', versionId: string): Promise<PublishedEnvelope<any> | null> {
    const key = this.getStoreKey(userId, type, versionId);
    return (await get<PublishedEnvelope<any>>(key)) || null;
  }
}
export const publicationRepository = new PublicationRepository();
