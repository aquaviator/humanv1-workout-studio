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
    PERMISSION_DENIED: 'Your account is not permitted to send this workout.', OWNERSHIP_CONFLICT: 'The workout owner could not be verified.',
    REVISION_CONFLICT: 'A newer cloud revision needs your attention.', REVISION_COLLISION: 'This revision differs from the cloud copy.',
    REMOTE_CHANGED_WHILE_LOCAL_PENDING: 'The cloud workout changed while this version was waiting.', CORRUPT_PAYLOAD: 'The saved workout could not be read safely.',
    UPLOAD_FAILED: 'HumanV1 could not accept this version.',
  };
  return code ? messages[code] ?? 'Delivery needs attention.' : undefined;
}

export function presentWorkoutDelivery(args: {
  workout: Workout; syncRecord?: SyncRecord | null; acknowledgements?: DeliveryAcknowledgement[];
  online?: boolean; latestRevision?: number; transientPhase?: 'VALIDATING' | 'PREPARING' | null;
}): DeliveryPresentation | null {
  const { workout, syncRecord, online = navigator.onLine, latestRevision, transientPhase } = args;
  if (transientPhase) return { phase: transientPhase, title: transientPhase === 'VALIDATING' ? 'Checking your workout' : 'Preparing version', detail: 'Please keep this page open for this step.', destinations: compatibleDestinations(workout), canRetry: false, isConflict: false };
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
  if (latestRevision && latestRevision > envelope.revision) return { ...common, phase: 'SUPERSEDED', title: 'Superseded by a newer version', detail: 'This version’s delivery history is retained.', canRetry: false, isConflict: false };
  if (syncRecord.status === 'QUEUED') return { ...common, phase: online ? 'QUEUED' : 'QUEUED_OFFLINE', title: online ? 'Saved and queued' : 'Queued — will send when connected', detail: online ? 'Safely stored on this device and waiting for normal synchronization. You may close the browser.' : 'Safely stored on this device. You may close the browser.', canRetry: false, isConflict: false };
  if (syncRecord.status === 'SENDING') return { ...common, phase: 'SENDING', title: 'Sending to HumanV1…', detail: 'Upload is in progress. Keep this page open until it is queued or sent.', canRetry: false, isConflict: false };
  if (syncRecord.status === 'CONFLICT') return { ...common, phase: 'CONFLICT', title: 'Delivery conflict', detail: safeReason(syncRecord.lastErrorCode)!, reason: syncRecord.lastErrorCode, canRetry: false, isConflict: true };
  if (syncRecord.status === 'FAILED') return { ...common, phase: 'RETRY_REQUIRED', title: 'Retry required', detail: safeReason(syncRecord.lastErrorCode)!, reason: syncRecord.lastErrorCode, canRetry: syncRecord.lastErrorCode !== 'PERMISSION_DENIED', isConflict: false };
  const acknowledged = destinations.filter(d => d.state !== 'NOT_YET_RECEIVED');
  if (acknowledged.length) {
    const successful = acknowledged.filter(d => !['FAILED', 'UNSUPPORTED_VERSION'].includes(d.state));
    const partial = successful.length > 0 && destinations.some(d => d.state === 'NOT_YET_RECEIVED');
    return { ...common, phase: partial ? 'PARTIALLY_DELIVERED' : 'AVAILABLE_IN_APPS', title: partial ? 'Partially delivered' : 'Available in your apps', detail: successful.map(d => `${d.state === 'APPLIED' ? 'Applied by' : 'Received by'} ${d.label}`).join(' · '), canRetry: false, isConflict: acknowledged.some(d => d.state === 'FAILED') };
  }
  return { ...common, phase: 'SENT_TO_HUMANV1', title: 'Workout sent to HumanV1', detail: destinations.length ? 'Your workout is safely stored and waiting for your compatible apps.' : 'Sent to HumanV1 — it will be available when you open a compatible app.', canRetry: false, isConflict: false };
}
