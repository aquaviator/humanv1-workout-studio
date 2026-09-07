import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  list: vi.fn(), syncDown: vi.fn(() => Promise.resolve()), subscribe: vi.fn(() => () => undefined),
}));
vi.mock('../../../repositories/WorkoutLibraryRepository', () => ({ workoutLibraryRepository: { list: mocks.list } }));
vi.mock('../../../repositories/SyncManager', () => ({ syncManager: { syncDown: mocks.syncDown, subscribe: mocks.subscribe } }));
vi.mock('../../../repositories/DraftRepository', () => ({ draftRepository: {} }));

import WorkoutsList from '../WorkoutsList';

const identity = { humanUserId: 'human-1', email: 'owner@example.test', displayName: 'Owner' };
const workout = { schemaVersion: 'humanv1.workout/1', workoutId: 'workout-1', title: 'Studio Production Acceptance',
  discipline: 'STRENGTH', catalogueReleaseId: 'release-1', tags: [], blocks: [] };
const version = { versionId: 'workout-1_r2_hash', globalId: 'workout-1', contentType: 'workout', schemaVersion: workout.schemaVersion,
  humanUserId: 'human-1', revision: 2, publicationState: 'PUBLISHED', sourceDraftId: 'workout-1', contentChecksum: 'hash',
  compatibleTags: ['STRENGTH'], createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', publishedAt: '2026-01-01T00:00:00Z', tombstoneState: 'ACTIVE', payload: workout };
const acknowledgement = { acknowledgementId: 'ack-1', humanUserId: 'human-1', workoutGlobalId: 'workout-1', versionId: version.versionId,
  applicationId: 'HUMAN_STRENGTH', appliedChecksum: 'hash', sourceRevision: 2, state: 'APPLIED', reasonCode: null };

describe('WorkoutsList cloud hydration', () => {
  it('shows a published-only workout and truthful exact-version delivery status', async () => {
    mocks.list.mockResolvedValue({ offline: false, verifiedAt: '2026-01-01T00:00:00Z', items: [{
      globalId: 'workout-1', workout, draft: null, updatedAt: '2026-01-01T00:00:00Z', state: 'DOWNLOADED',
      latestVersion: version, versions: [version, { ...version, revision: 1, versionId: 'workout-1_r1_hash' }], acknowledgement, acknowledgements: [acknowledgement], syncRecord: { syncType: 'publication', envelope: version, status: 'SYNCED', type: 'workout' },
    }] });
    render(<MemoryRouter><WorkoutsList identity={identity} /></MemoryRouter>);
    expect(await screen.findByText('Studio Production Acceptance')).toBeInTheDocument();
    expect(screen.getByText('Applied by Human Strength')).toBeInTheDocument();
    expect(screen.getByText('Latest published revision 2 · 2 immutable versions')).toBeInTheDocument();
    expect(screen.queryByText('No workouts found.')).not.toBeInTheDocument();
  });

  it('labels cached reconstruction when offline', async () => {
    mocks.list.mockResolvedValue({ offline: true, verifiedAt: '2026-01-01T00:00:00Z', items: [{
      globalId: 'workout-1', workout, draft: null, updatedAt: '2026-01-01T00:00:00Z', state: 'SENT',
      latestVersion: { revision: 2 }, versions: [{ revision: 2 }], acknowledgement: null, acknowledgements: [], syncRecord: null,
    }] });
    render(<MemoryRouter><WorkoutsList identity={identity} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('last verified cloud status'));
    expect(screen.getAllByText('Workout sent to HumanV1').length).toBeGreaterThan(0);
  });
});
