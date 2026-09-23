import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), remote: vi.fn(), saveWorkout: vi.fn() }));
vi.mock('../../../repositories/SyncManager', () => ({ syncManager: {
  listSyncRecords: mocks.list, resolveWithRemote: mocks.remote,
} }));
vi.mock('../../../repositories/DraftRepository', () => ({ draftRepository: {
  saveWorkoutDraft: mocks.saveWorkout, savePlanDraft: vi.fn(), saveProtocolDraft: vi.fn(),
} }));
vi.mock('uuid', () => ({ v4: () => 'preserved-copy-id' }));

import ConflictCentre from '../ConflictCentre';

const identity = { humanUserId: 'human-1', email: 'owner@example.test', displayName: 'Owner' };
const issue = { status: 'NEEDS_USER_REVIEW', lastErrorCode: 'REVISION_COLLISION', type: 'workout',
  envelope: { globalId: 'workout-1', humanUserId: 'human-1', revision: 2, updatedAt: '2026-01-01T00:00:00Z',
    payload: { schemaVersion: 'humanv1.workout/1', workoutId: 'workout-1', title: 'Send Workout', discipline: 'STRENGTH', tags: [], blocks: [] } } };

describe('Issues needing attention', () => {
  it('offers only safe resolution choices and keeps internal details collapsed', async () => {
    mocks.list.mockImplementation((_owner: string, type: string) => Promise.resolve(type === 'workout' ? [issue] : []));
    render(<ConflictCentre identity={identity} />);
    expect(await screen.findByRole('heading', { name: 'Issues needing attention' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Keep Studio/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Keep newer cloud version' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a copy from my preserved changes' })).toBeInTheDocument();
    expect(screen.queryByText(/REVISION_COLLISION/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review differences' }));
    expect(screen.getByText(/REVISION_COLLISION/)).toBeInTheDocument();
  });

  it('creates an explicit copy before accepting the cloud version', async () => {
    mocks.list.mockImplementation((_owner: string, type: string) => Promise.resolve(type === 'workout' ? [issue] : []));
    mocks.saveWorkout.mockResolvedValue(undefined); mocks.remote.mockResolvedValue(undefined);
    render(<ConflictCentre identity={identity} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Create a copy from my preserved changes' }));
    await waitFor(() => expect(mocks.saveWorkout).toHaveBeenCalled());
    expect(mocks.saveWorkout.mock.calls[0][1]).toMatchObject({ workoutId: 'preserved-copy-id', title: 'Send Workout (Preserved copy)' });
    expect(mocks.remote).toHaveBeenCalledWith('human-1', issue);
  });

  it('shows a server validation explanation and keeps its technical reason collapsed', async () => {
    const validationIssue = { ...issue, type: 'plan', lastErrorCode: 'CONTENT_REJECTED', attention: {
      explanation: 'Workout changed.', correctiveAction: 'Review the workout.', contentPreserved: true, technicalCode: 'WORKOUT_REVISION_STALE',
    } };
    mocks.list.mockImplementation((_owner: string, type: string) => Promise.resolve(type === 'plan' ? [validationIssue] : []));
    render(<ConflictCentre identity={identity} />);
    expect(await screen.findByText('Workout changed.')).toBeInTheDocument();
    expect(screen.getByText('Review the workout.')).toBeInTheDocument();
    expect(screen.queryByText(/WORKOUT_REVISION_STALE/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Review differences' }));
    expect(screen.getByText(/WORKOUT_REVISION_STALE/)).toBeInTheDocument();
  });
});
