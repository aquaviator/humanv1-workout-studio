import { describe, expect, it } from 'vitest';
import { compatibleDestinations, presentWorkoutDelivery } from '../deliveryPresentation';
import { Workout } from '../types';

const workout: Workout = { schemaVersion: 'humanv1.workout/1', workoutId: 'workout-1', title: 'Mixed session', discipline: 'HYBRID', catalogueReleaseId: 'release-1', tags: [], blocks: [] };
const envelope = { versionId: 'workout-1_r1_hash', globalId: 'workout-1', contentType: 'workout' as const, schemaVersion: workout.schemaVersion, humanUserId: 'owner-1', revision: 1, publicationState: 'PUBLISHED' as const, sourceDraftId: 'workout-1', contentChecksum: 'checksum-1', compatibleTags: ['HYBRID'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-01T00:00:00Z', tombstoneState: 'ACTIVE' as const, payload: workout };
const sync = (status: 'QUEUED' | 'SENDING' | 'SYNCED' | 'CONFLICT' | 'FAILED', lastErrorCode?: any) => ({ syncType: 'publication' as const, envelope, status, type: 'workout' as const, lastErrorCode });
const ack = (overrides: Record<string, unknown> = {}) => ({ acknowledgementId: 'ack-1', humanUserId: 'owner-1', workoutGlobalId: 'workout-1', versionId: envelope.versionId, applicationId: 'HUMAN_STRENGTH' as const, appliedChecksum: envelope.contentChecksum, sourceRevision: 1, state: 'APPLIED' as const, reasonCode: null, ...overrides });

describe('truthful workout delivery presentation', () => {
  it('derives each compatible destination without claiming it is installed', () => expect(compatibleDestinations(workout).map(d => d.label)).toEqual(['Human Strength', 'Human HIIT', 'Human Cardio', 'Human Mobility']));
  it('distinguishes durable offline and online queues', () => {
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('QUEUED'), online: false })?.phase).toBe('QUEUED_OFFLINE');
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('QUEUED'), online: true })?.phase).toBe('QUEUED');
  });
  it('does not claim app delivery while sending or after cloud acknowledgement alone', () => {
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('SENDING') })?.phase).toBe('SENDING');
    const sent = presentWorkoutDelivery({ workout, syncRecord: sync('SYNCED'), acknowledgements: [] });
    expect(sent?.phase).toBe('SENT_TO_HUMANV1'); expect(sent?.title).not.toContain('Available in your apps');
  });
  it('accepts only an acknowledgement matching owner, workout, version and checksum', () => {
    for (const bad of [{ humanUserId: 'other' }, { workoutGlobalId: 'other' }, { versionId: 'other' }, { appliedChecksum: 'other' }])
      expect(presentWorkoutDelivery({ workout, syncRecord: sync('SYNCED'), acknowledgements: [ack(bad)] })?.phase).toBe('SENT_TO_HUMANV1');
  });
  it('shows destination-specific partial delivery for an exact acknowledgement', () => {
    const result = presentWorkoutDelivery({ workout, syncRecord: sync('SYNCED'), acknowledgements: [ack()] });
    expect(result?.phase).toBe('PARTIALLY_DELIVERED'); expect(result?.detail).toContain('Applied by Human Strength');
    expect(result?.destinations.find(d => d.applicationId === 'HUMAN_HIIT')?.state).toBe('NOT_YET_RECEIVED');
  });
  it('retains conflicts, retry failures and superseded history', () => {
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('CONFLICT', 'OWNERSHIP_CONFLICT') })?.phase).toBe('CONFLICT');
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('FAILED', 'NETWORK_RETRYABLE') })?.canRetry).toBe(true);
    expect(presentWorkoutDelivery({ workout, syncRecord: sync('SYNCED'), latestRevision: 2 })?.phase).toBe('SUPERSEDED');
  });
});
