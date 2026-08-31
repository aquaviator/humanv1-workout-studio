import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import WorkoutBuilder from '../WorkoutBuilder';
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

describe('WorkoutBuilder', () => {
  it('renders correctly', () => {
    render(<WorkoutBuilder identity={mockIdentity} />);
    expect(screen.getByDisplayValue('New Workout')).toBeInTheDocument();
  });

  it('has no basic accessibility violations', async () => {
    const { container } = render(<WorkoutBuilder identity={mockIdentity} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('can open exercise drawer', () => {
    render(<WorkoutBuilder identity={mockIdentity} />);
    const addButton = screen.getByText('Add Exercise');
    fireEvent.click(addButton);
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  it('adds, reorders and removes exercises inside a superset', async () => {
    render(<WorkoutBuilder identity={mockIdentity} />);
    fireEvent.click(screen.getByText('Add Superset'));

    fireEvent.click(screen.getByText('Add exercise to superset'));
    fireEvent.click(await screen.findByText('Bench Press'));
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Add exercise to superset'));
    fireEvent.click(await screen.findByText('Treadmill Run'));
    await waitFor(() => expect(screen.getByLabelText('Move Treadmill Run up')).toBeEnabled());

    fireEvent.click(screen.getByLabelText('Move Treadmill Run up'));
    fireEvent.click(screen.getByLabelText('Remove Bench Press from superset'));
    expect(screen.queryByLabelText('Remove Bench Press from superset')).not.toBeInTheDocument();
  });

  it('keeps circuit rounds within the supported range', () => {
    render(<WorkoutBuilder identity={mockIdentity} />);
    fireEvent.click(screen.getByText('Add Circuit'));
    const rounds = screen.getByLabelText('Circuit rounds');
    fireEvent.change(rounds, { target: { value: '0' } });
    expect(rounds).toHaveValue(1);
    fireEvent.change(rounds, { target: { value: '150' } });
    expect(rounds).toHaveValue(99);
  });
});
