import { collection, getDocs } from 'firebase/firestore';
import { get, set } from 'idb-keyval';
import { db } from '../config/firebase';
import { PublishedEnvelope } from '../domain/publication';
import { Workout } from '../domain/types';
import { DeliveryAcknowledgement, deliveryAcknowledgementRepository } from './DeliveryAcknowledgementRepository';
import { DraftEnvelope, draftRepository } from './DraftRepository';
import { SyncRecord, syncManager } from './SyncManager';

export type WorkoutLibraryState = 'DRAFT' | 'QUEUED' | 'SENT' | 'DOWNLOADED' | 'CONFLICT' | 'RETRY_REQUIRED';

export interface WorkoutLibraryItem {
  globalId: string;
  workout: Workout;
  draft: DraftEnvelope<Workout> | null;
  versions: PublishedEnvelope<Workout>[];
  latestVersion: PublishedEnvelope<Workout> | null;
  acknowledgement: DeliveryAcknowledgement | null;
  acknowledgements: DeliveryAcknowledgement[];
  state: WorkoutLibraryState;
  updatedAt: string;
}

export interface WorkoutLibraryResult {
  items: WorkoutLibraryItem[];
  offline: boolean;
  verifiedAt: string | null;
}

interface VerifiedCache {
  humanUserId: string;
  publications: PublishedEnvelope<Workout>[];
  acknowledgements: DeliveryAcknowledgement[];
  verifiedAt: string;
}

type PublicationLoader = (humanUserId: string) => Promise<unknown[]>;
type AcknowledgementLoader = (humanUserId: string) => Promise<DeliveryAcknowledgement[]>;

function isOwnedPublication(value: unknown, humanUserId: string): value is PublishedEnvelope<Workout> {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const payload = item.payload as Record<string, unknown> | undefined;
  return item.humanUserId === humanUserId && item.contentType === 'workout' && item.publicationState === 'PUBLISHED' &&
    item.tombstoneState === 'ACTIVE' && typeof item.versionId === 'string' && typeof item.globalId === 'string' &&
    typeof item.revision === 'number' && typeof item.contentChecksum === 'string' && payload?.workoutId === item.globalId;
}

export class WorkoutLibraryRepository {
  constructor(
    private readonly loadPublications: PublicationLoader = async humanUserId => {
      const snapshot = await getDocs(collection(db, 'users', humanUserId, 'publishedWorkouts'));
      return snapshot.docs.map(document => document.data());
    },
    private readonly loadAcknowledgements: AcknowledgementLoader = async humanUserId =>
      deliveryAcknowledgementRepository.listForOwner(humanUserId),
    private readonly online: () => boolean = () => navigator.onLine,
  ) {}

  private cacheKey(humanUserId: string) { return `verified_workout_library_${humanUserId}`; }

  async list(humanUserId: string): Promise<WorkoutLibraryResult> {
    const [drafts, syncRecords] = await Promise.all([
      draftRepository.listWorkoutEnvelopes(humanUserId),
      syncManager.listSyncRecords(humanUserId, 'workout'),
    ]);
    let cache = await get<VerifiedCache>(this.cacheKey(humanUserId));
    let offline = !this.online();

    if (!offline) {
      try {
        const [rawPublications, acknowledgements] = await Promise.all([
          this.loadPublications(humanUserId), this.loadAcknowledgements(humanUserId),
        ]);
        cache = {
          humanUserId,
          publications: rawPublications.filter(value => isOwnedPublication(value, humanUserId)),
          acknowledgements: acknowledgements.filter(value => value.humanUserId === humanUserId),
          verifiedAt: new Date().toISOString(),
        };
        await set(this.cacheKey(humanUserId), cache);
      } catch {
        offline = true;
      }
    }

    if (cache?.humanUserId !== humanUserId) cache = undefined;
    const publications = cache?.publications ?? [];
    const acknowledgements = cache?.acknowledgements ?? [];
    const syncByWorkout = new Map<string, SyncRecord>();
    syncRecords.forEach(record => syncByWorkout.set(record.envelope.globalId, record));
    const ids = new Set([...drafts.map(draft => draft.globalId), ...publications.map(version => version.globalId)]);

    const items = [...ids].map(globalId => {
      const draft = drafts.find(candidate => candidate.globalId === globalId) ?? null;
      const versions = publications.filter(candidate => candidate.globalId === globalId)
        .sort((a, b) => b.revision - a.revision);
      const latestVersion = versions[0] ?? null;
      const exactAcks = latestVersion ? acknowledgements.filter(ack => ack.workoutGlobalId === globalId &&
        ack.versionId === latestVersion.versionId && ack.appliedChecksum === latestVersion.contentChecksum) : [];
      const acknowledgement = exactAcks.sort((a, b) => b.sourceRevision - a.sourceRevision)[0] ?? null;
      const sync = syncByWorkout.get(globalId);
      let state: WorkoutLibraryState = latestVersion ? 'SENT' : 'DRAFT';
      if (sync?.status === 'CONFLICT') state = 'CONFLICT';
      else if (sync?.status === 'FAILED') state = 'RETRY_REQUIRED';
      else if (sync?.status === 'QUEUED' || sync?.status === 'SENDING') state = 'QUEUED';
      else if (acknowledgement?.state === 'APPLIED') state = 'DOWNLOADED';
      else if (acknowledgement?.state === 'CONFLICT' || acknowledgement?.state === 'REJECTED') state = 'CONFLICT';
      return {
        globalId,
        workout: draft?.payload ?? latestVersion!.payload,
        draft,
        versions,
        latestVersion,
        acknowledgement,
        acknowledgements: acknowledgements.filter(ack => ack.workoutGlobalId === globalId && versions.some(version =>
          version.versionId === ack.versionId && version.contentChecksum === ack.appliedChecksum)),
        state,
        updatedAt: draft?.updatedAt ?? latestVersion?.updatedAt ?? latestVersion?.publishedAt ?? '',
      };
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return { items, offline, verifiedAt: cache?.verifiedAt ?? null };
  }
}

export const workoutLibraryRepository = new WorkoutLibraryRepository();
