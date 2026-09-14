import { PublishedEnvelope } from './publication';
import { Workout } from './types';
import { DeliveryAcknowledgement } from '../repositories/DeliveryAcknowledgementRepository';
import { SyncFailureCode, SyncRecord } from '../repositories/SyncManager';

export type DeliveryPhase = 'VALIDATING' | 'NEEDS_ATTENTION' | 'PREPARING' | 'QUEUED_OFFLINE' | 'QUEUED' |
  'SENDING' | 'SENT_TO_HUMANV1' | 'AVAILABLE_IN_APPS' | 'PARTIALLY_DELIVERED' | 'CONFLICT' |
  'RETRY_REQUIRED' | 'SUPERSEDED';
export type DestinationState = 'NOT_YET_RECEIVED' | 'RECEIVED' | 'DOWNLOADED' | 'APPLIED' | 'UNSUPPORTED_VERSION' | 'FAILED';

export interface DestinationDelivery { applicationId: string; label: string; state: DestinationState; timestamp?: string; reason?: string }
export interface DeliveryPresentation {
  phase: DeliveryPhase; title: string; detail: string; destinations: DestinationDelivery[];
  versionId?: string; revision?: number; checksum?: string; timestamp?: string; reason?: string;
  canRetry: boolean; isConflict: boolean;
  primaryStatus: 'SAVED_IN_STUDIO' | 'SENDING' | 'ON_PHONE' | 'NEEDS_ATTENTION';
  actionLabel?: 'Send to HumanV1' | 'Review workout' | 'Publish current version';
}

const appLabels: Record<string, string> = {
  HUMAN_STRENGTH: 'Human Strength', HUMAN_HIIT: 'Human HIIT', HUMAN_CARDIO: 'Human Cardio', HUMAN_MOBILITY: 'Human Mobility',
};

export function compatibleDestinations(workout: Workout): DestinationDelivery[] {
  const ids = new Set<string>();
  if (['STRENGTH', 'HYBRID', 'CIRCUIT'].includes(workout.discipline)) ids.add('HUMAN_STRENGTH');
  if (['HIIT', 'TABATA', 'HYBRID', 'CIRCUIT'].includes(workout.discipline)) ids.add('HUMAN_HIIT');
  if (['CARDIO', 'HYBRID'].includes(workout.discipline)) ids.add('HUMAN_CARDIO');
  if (['MOBILITY', 'HYBRID'].includes(workout.discipline)) ids.add('HUMAN_MOBILITY');
  return [...ids].map(applicationId => ({ applicationId, label: appLabels[applicationId], state: 'NOT_YET_RECEIVED' }));
}

function safeReason(code?: SyncFailureCode | string | null) {
  const messages: Record<string, string> = {
    NETWORK_OFFLINE: 'No connection. It will retry automatically when you reconnect.', NETWORK_RETRYABLE: 'HumanV1 could not be reached yet.',
    PERMISSION_DENIED: 'Studio could not safely update this item. Review it before taking another action.', OWNERSHIP_CONFLICT: 'The workout owner could not be verified.',
    REVISION_CONFLICT: 'Newer edits need attention.', REVISION_COLLISION: 'This workout changed elsewhere. Your Studio changes are preserved.',
    REMOTE_CHANGED_WHILE_LOCAL_PENDING: 'This item changed elsewhere. Your Studio changes are preserved.', CORRUPT_PAYLOAD: 'The saved workout could not be read safely.',
    UPLOAD_FAILED: 'HumanV1 could not safely accept this version.',
  };
  return code ? messages[code] ?? 'Delivery needs attention.' : undefined;
}

export function presentWorkoutDelivery(args: {
  workout: Workout; syncRecord?: SyncRecord | null; acknowledgements?: DeliveryAcknowledgement[];
  online?: boolean; latestRevision?: number; transientPhase?: 'VALIDATING' | 'PREPARING' | null;
  acknowledgementVerificationFailed?: boolean;
  publishedVersionAvailable?: boolean;
  editNeedsAttention?: boolean;
}): DeliveryPresentation | null {
  const { workout, syncRecord, online = navigator.onLine, latestRevision, transientPhase } = args;
  if (transientPhase) return { phase: transientPhase, primaryStatus: 'SENDING', title: 'Sending to HumanV1', detail: 'Sending to your phone…', destinations: compatibleDestinations(workout), canRetry: false, isConflict: false };
  if (!syncRecord || syncRecord.syncType !== 'publication') return null;
  const envelope = syncRecord.envelope as PublishedEnvelope<Workout>;
  const destinations = compatibleDestinations(workout);
  const exact = (args.acknowledgements ?? []).filter(a => a.humanUserId === envelope.humanUserId && a.workoutGlobalId === envelope.globalId && a.versionId === envelope.versionId && a.appliedChecksum === envelope.contentChecksum);
  for (const ack of exact) {
    const destination = destinations.find(d => d.applicationId === ack.applicationId);
    if (!destination) continue;
    destination.state = ack.state === 'APPLIED' ? 'APPLIED' : 'FAILED';
    destination.reason = ack.reasonCode ?? undefined;
  }
  const common = { destinations, versionId: envelope.versionId, revision: envelope.revision, checksum: envelope.contentChecksum, timestamp: envelope.publishedAt };
  const acknowledged = destinations.filter(d => d.state !== 'NOT_YET_RECEIVED');
  if (acknowledged.some(d => d.state === 'APPLIED')) {
    return { ...common, phase: 'AVAILABLE_IN_APPS', primaryStatus: 'ON_PHONE', title: 'On your phone', detail: args.editNeedsAttention ? 'Delivered. Newer edits need attention.' : 'Delivered.', canRetry: false, isConflict: Boolean(args.editNeedsAttention) };
  }
  if (args.publishedVersionAvailable === false) return { ...common, phase: 'NEEDS_ATTENTION', primaryStatus: 'NEEDS_ATTENTION', title: 'Needs attention', detail: 'This older delivery cannot be completed because its published version is unavailable.', canRetry: false, isConflict: false, actionLabel: 'Review workout' };
  if (latestRevision && latestRevision > envelope.revision) return { ...common, phase: 'SUPERSEDED', primaryStatus: 'SAVED_IN_STUDIO', title: 'Saved in Studio', detail: 'A newer version is saved. This delivery history remains available in Technical details.', canRetry: false, isConflict: false };
  if (syncRecord.status === 'QUEUED') return { ...common, phase: online ? 'QUEUED' : 'QUEUED_OFFLINE', primaryStatus: 'SENDING', title: 'Sending to HumanV1', detail: online ? 'Sending to your phone…' : 'Will send automatically when you are online.', canRetry: false, isConflict: false };
  if (syncRecord.status === 'SENDING') return { ...common, phase: 'SENDING', primaryStatus: 'SENDING', title: 'Sending to HumanV1', detail: 'Sending to your phone…', canRetry: false, isConflict: false };
  if (syncRecord.status === 'CONFLICT' || syncRecord.status === 'NEEDS_USER_REVIEW') return { ...common, phase: 'CONFLICT', primaryStatus: 'NEEDS_ATTENTION', title: 'Needs attention', detail: safeReason(syncRecord.lastErrorCode)!, reason: syncRecord.lastErrorCode, canRetry: false, isConflict: true };
  if (syncRecord.status === 'FAILED') {
    const automatic = syncRecord.lastErrorCode === 'NETWORK_OFFLINE' || syncRecord.lastErrorCode === 'NETWORK_RETRYABLE';
    return { ...common, phase: 'RETRY_REQUIRED', primaryStatus: automatic ? 'SENDING' : 'NEEDS_ATTENTION', title: automatic ? 'Sending to HumanV1' : 'Needs attention', detail: safeReason(syncRecord.lastErrorCode)!, reason: syncRecord.lastErrorCode, canRetry: false, isConflict: false };
  }
  if (args.acknowledgementVerificationFailed) return { ...common, phase: 'RETRY_REQUIRED', primaryStatus: 'NEEDS_ATTENTION', title: 'Delivery verification unavailable', detail: 'HumanV1 has the workout, but its phone status could not be verified. Reconnect or refresh to check again.', reason: 'NETWORK_RETRYABLE', canRetry: false, isConflict: false };
  return { ...common, phase: 'SENT_TO_HUMANV1', primaryStatus: 'SENDING', title: 'Sending to HumanV1', detail: 'Waiting for your phone.', canRetry: false, isConflict: false };
}
