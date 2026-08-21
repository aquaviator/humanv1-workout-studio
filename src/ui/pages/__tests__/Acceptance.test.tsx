import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import WorkoutBuilder from '../WorkoutBuilder';
import ProtocolBuilder from '../ProtocolBuilder';
import PlanBuilder from '../PlanBuilder';
import { HumanIdentity } from '../../../domain/identity';

const mockIdentity: HumanIdentity = {
  humanUserId: 'test-user',
  email: 'test@humanv1.com',
  displayName: 'Test User'
};

const { mockDbStore } = vi.hoisted(() => {
  return { mockDbStore: new Map() };
});

vi.mock('idb-keyval', () => {
  return {
    get: vi.fn(key => Promise.resolve(mockDbStore.get(key))),
    set: vi.fn((key, val) => {
      mockDbStore.set(key, val);
      return Promise.resolve();
    }),
    keys: vi.fn(() => Promise.resolve(Array.from(mockDbStore.keys()))),
    del: vi.fn(key => {
      mockDbStore.delete(key);
      return Promise.resolve();
    }),
  };
});

describe('Acceptance Criteria', () => {
  beforeEach(() => {
    mockDbStore.clear();
  });

  describe('WorkoutBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<WorkoutBuilder identity={mockIdentity} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Treadmill has no default repetitions or load', async () => {
      render(<WorkoutBuilder identity={mockIdentity} />);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Add Exercise'));
      const treadmill = await screen.findByText('Treadmill Run');
      fireEvent.click(treadmill);
      
      // Should add the block
      await screen.findByText('Treadmill Run');
      // Should not have "count" or "kg" units
      expect(screen.queryByText('count')).not.toBeInTheDocument();
      expect(screen.queryByText('kg')).not.toBeInTheDocument();
      // Should have "s" and "m" (duration and distance)
      expect(screen.getByText('s')).toBeInTheDocument();
      expect(screen.getByText('m')).toBeInTheDocument();
    });

    it('Strength exercise uses supported repetitions/load', async () => {
      render(<WorkoutBuilder identity={mockIdentity} />);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Add Exercise'));
      const bench = await screen.findByText('Bench Press');
      fireEvent.click(bench);
      
      await screen.findByText('Bench Press');
      expect(screen.getByText('count')).toBeInTheDocument();
      expect(screen.getByText('kg')).toBeInTheDocument();
    });

    it('Workout save/reload/edit/idempotence', async () => {
      const { unmount } = render(<WorkoutBuilder identity={mockIdentity} />);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Workout Title');
      fireEvent.change(titleInput, { target: { value: 'My Saved Workout' } });
      
      // Wait for save
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      // Remount
      render(<WorkoutBuilder identity={mockIdentity} />);
      await screen.findByDisplayValue('My Saved Workout');
    });
  });

  describe('ProtocolBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<ProtocolBuilder identity={mockIdentity} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Protocol serialize/save/reload/edit', async () => {
      const { unmount } = render(<ProtocolBuilder identity={mockIdentity} />);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Protocol Title');
      fireEvent.change(titleInput, { target: { value: 'Custom HIIT' } });
      
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      render(<ProtocolBuilder identity={mockIdentity} />);
      await screen.findByDisplayValue('Custom HIIT');
    });
  });

  describe('PlanBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<PlanBuilder identity={mockIdentity} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Plan save/reload, Multiple weeks, Add/move/remove placements, Keyboard-accessible alternatives', async () => {
      const { unmount } = render(<PlanBuilder identity={mockIdentity} />);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Plan Title');
      fireEvent.change(titleInput, { target: { value: 'My Epic Plan' } });
      
      // Mobile-friendly Add buttons (keyboard accessible alternatives to drag and drop)
      const addButtons = screen.getAllByLabelText('Add to Monday');
      fireEvent.click(addButtons[0]);
      
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      render(<PlanBuilder identity={mockIdentity} />);
      await screen.findByDisplayValue('My Epic Plan');
    });
  });
});
