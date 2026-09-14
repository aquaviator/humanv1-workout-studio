import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ drafts: vi.fn(), publications: vi.fn(), subscribe: vi.fn(() => () => undefined) }));
vi.mock('../../../repositories/SyncManager', () => ({ syncManager: {
  listSyncRecords: mocks.drafts, listPublicationSyncRecords: mocks.publications, subscribe: mocks.subscribe,
} }));

import SyncActivityIndicator from '../SyncActivityIndicator';

const identity = { humanUserId: 'human-1', email: 'owner@example.test', displayName: 'Owner' };
const record = (status: string, code?: string) => ({ status, lastErrorCode: code, type: 'workout', syncType: 'publication',
  envelope: { globalId: `${status}-${code ?? ''}`, humanUserId: 'human-1', revision: 1, payload: { title: 'Workout' } } });

describe('SyncActivityIndicator', () => {
  it('summarizes automatic work and terminal attention without exposing codes by default', async () => {
    mocks.drafts.mockResolvedValue([]);
    mocks.publications.mockImplementation((_owner: string, type: string) => Promise.resolve(type === 'workout' ? [
      record('FAILED', 'NETWORK_RETRYABLE'), record('NEEDS_USER_REVIEW', 'PERMISSION_DENIED'),
    ] : []));
    render(<SyncActivityIndicator identity={identity} />);
    expect(await screen.findByText('1 item needs attention')).toBeInTheDocument();
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Synchronization activity')).toBeInTheDocument();
    expect(screen.getByText(/PERMISSION_DENIED/)).toBeInTheDocument();
  });

  it('announces a calm saved state when no work is pending', async () => {
    mocks.drafts.mockResolvedValue([]); mocks.publications.mockResolvedValue([]);
    render(<SyncActivityIndicator identity={identity} />);
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeInTheDocument());
  });
});
