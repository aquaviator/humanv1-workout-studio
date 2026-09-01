import { get, keys, set } from 'idb-keyval';
import { sha256 } from 'js-sha256';
import { ContentType, compileProtocolTimeline, CompiledProtocolStep, PublishableContent, PublishedEnvelope } from '../domain/publication';
import { Plan, Protocol, Workout } from '../domain/types';
import { validatePlan } from '../domain/validation/planValidation';
import { validateProtocol } from '../domain/validation/protocolValidation';
import { validateWorkout } from '../domain/validation/workoutValidation';
import { syncManager } from './SyncManager';
import { authRepository } from './AuthManager';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().filter(key => record[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function tagsFor(type: ContentType, payload: PublishableContent): string[] {
  if (type === 'workout') return [...new Set([(payload as Workout).discipline, ...(payload as Workout).tags])].sort();
  if (type === 'protocol') return [...new Set([(payload as Protocol).protocolType, ...(payload as Protocol).equipmentCapabilityKeys])].sort();
  return ['PLAN'];
}

export class PublicationRepository {
  private getStoreKey(userId: string, type: ContentType, versionId: string) { return `published_${userId}_${type}_${versionId}`; }
  public generateChecksum(payload: PublishableContent): Promise<string> { return Promise.resolve(sha256(canonicalize(payload))); }

  async publishAuthenticated<T extends PublishableContent>(contentType: ContentType, globalId: string, payload: T, compatibleTags?: readonly string[], suppliedTimeline?: CompiledProtocolStep[]): Promise<PublishedEnvelope<T>> {
    const identity = await authRepository.getCurrentIdentity();
    if (!identity) throw new Error('TRUSTED_IDENTITY_UNAVAILABLE');
    return this.publish(identity.humanUserId, contentType, globalId, payload, compatibleTags, suppliedTimeline);
  }

  async publish<T extends PublishableContent>(trustedHumanUserId: string, contentType: ContentType, globalId: string, payload: T, _compatibleTags?: readonly string[], suppliedTimeline?: CompiledProtocolStep[]): Promise<PublishedEnvelope<T>> {
    const actualId = contentType === 'workout' ? (payload as Workout).workoutId : contentType === 'plan' ? (payload as Plan).planId : (payload as Protocol).protocolId;
    if (actualId !== globalId) throw new Error('CONTENT_ID_MISMATCH');
    const errors = contentType === 'workout' ? validateWorkout(payload as Workout, []) : contentType === 'plan' ? validatePlan(payload as Plan) : validateProtocol(payload as Protocol);
    if (errors.length) throw new Error('INVALID_CONTENT');
    const compiledTimeline = contentType === 'protocol' ? compileProtocolTimeline(payload as Protocol) : undefined;
    if (suppliedTimeline && canonicalize(suppliedTimeline) !== canonicalize(compiledTimeline)) throw new Error('INVALID_COMPILED_TIMELINE');
    const checksum = await this.generateChecksum(payload);
    const versions = await this.listPublishedVersions<T>(trustedHumanUserId, contentType, globalId);
    const existing = versions.find(version => version.contentChecksum === checksum);
    if (existing) { await syncManager.queueUpload(existing, contentType, 'publication'); return existing; }
    const revision = versions.length ? Math.max(...versions.map(version => version.revision)) + 1 : 1;
    const versionId = `${globalId}_r${revision}_${checksum.slice(0, 12)}`;
    const now = new Date().toISOString();
    const envelope: PublishedEnvelope<T> = {
      versionId, globalId, contentType, schemaVersion: payload.schemaVersion, humanUserId: trustedHumanUserId,
      revision, publicationState: 'PUBLISHED', sourceDraftId: globalId, contentChecksum: checksum,
      compatibleTags: tagsFor(contentType, payload), createdAt: now, updatedAt: now, publishedAt: now,
      tombstoneState: 'ACTIVE', payload, ...(compiledTimeline ? { compiledTimeline } : {})
    };
    await set(this.getStoreKey(trustedHumanUserId, contentType, versionId), envelope);
    await syncManager.queueUpload(envelope, contentType, 'publication');
    return envelope;
  }

  async listPublishedVersions<T extends PublishableContent>(userId: string, type: ContentType, globalId?: string): Promise<PublishedEnvelope<T>[]> {
    const prefix = `published_${userId}_${type}_`;
    const result: PublishedEnvelope<T>[] = [];
    for (const key of (await keys()).filter((key): key is string => typeof key === 'string' && key.startsWith(prefix))) {
      const envelope = await get<PublishedEnvelope<T>>(key);
      if (envelope && (!globalId || envelope.globalId === globalId)) result.push(envelope);
    }
    return result.sort((a, b) => b.revision - a.revision);
  }

  async getPublishedVersion<T extends PublishableContent>(userId: string, type: ContentType, versionId: string): Promise<PublishedEnvelope<T> | null> {
    return (await get<PublishedEnvelope<T>>(this.getStoreKey(userId, type, versionId))) ?? null;
  }
}

export const publicationRepository = new PublicationRepository();
