import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'jest-axe';
import WorkoutBuilder from '../WorkoutBuilder';
import { HumanIdentity } from '../../../domain/identity';

const mockIdentity: HumanIdentity = {
  humanUserId: 'test-user',
  canonicalEmail: 'test@humanv1.com',
  displayName: 'Test User'
};

// Mock idb-keyval to avoid indexDB issues in jsdom
vi.mock('idb-keyval', () => {
  const store = new Map();
  return {
    get: vi.fn(key => Promise.resolve(store.get(key))),
    set: vi.fn((key, val) => {
      store.set(key, val);
      return Promise.resolve();
    }),
    del: vi.fn(key => {
      store.delete(key);
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
});
