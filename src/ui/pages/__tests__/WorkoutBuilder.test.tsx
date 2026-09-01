import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { axe } from 'jest-axe';
import WorkoutBuilder from '../WorkoutBuilder';
import { HumanIdentity } from '../../../domain/identity';
import { Workout } from '../../../domain/types';

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

vi.mock('../../../repositories/FirebaseCatalogueRepository', () => ({
  catalogueRepository: { getExercises: vi.fn(() => Promise.resolve([
    { exerciseId: 'bench-press', name: 'Bench Press', category: 'Strength', equipment: [], aliases: [], metricProfile: { primary: ['repetition_count'], secondary: ['external_load'], optional: [], unsupported: [] } },
    { exerciseId: 'treadmill-run', name: 'Treadmill Run', category: 'Cardio', equipment: [], aliases: [], metricProfile: { primary: ['duration'], secondary: [], optional: [], unsupported: [] } },
  ])) },
}));

describe('WorkoutBuilder', () => {
  it('renders correctly', () => {
    render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    expect(screen.getByDisplayValue('New Workout')).toBeInTheDocument();
  });

  it('has no basic accessibility violations', async () => {
    const { container } = render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('can open exercise drawer', () => {
    render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    const addButton = screen.getByText('Add Exercise');
    fireEvent.click(addButton);
    expect(screen.getByText('Library')).toBeInTheDocument();
  });

  it('adds, reorders and removes exercises inside a superset', async () => {
    render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Add Superset'));
    fireEvent.click(screen.getByText('Add exercise to superset'));
    
    const bench = (await screen.findAllByText('Bench Press'))[0];
    fireEvent.click(bench);
    await waitFor(() => expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(1));
    
    fireEvent.click(screen.getByText('Add exercise to superset'));
    const tread = (await screen.findAllByText('Treadmill Run'))[0];
    fireEvent.click(tread);

    await waitFor(() => expect(screen.getAllByText('Treadmill Run').length).toBeGreaterThan(1));
    await waitFor(() => expect(screen.getByLabelText('Move Treadmill Run up')).toBeEnabled());
    fireEvent.click(screen.getByLabelText('Move Treadmill Run up'));
    fireEvent.click(screen.getByLabelText('Remove Bench Press from superset'));
    expect(screen.queryByLabelText('Remove Bench Press from superset')).not.toBeInTheDocument();
  });

  it('keeps circuit rounds within the supported range', () => {
    render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
    fireEvent.click(screen.getByText('Add Circuit'));
    const rounds = screen.getByLabelText('Circuit rounds');
    fireEvent.change(rounds, { target: { value: '0' } });
    expect(rounds).toHaveValue(1);
    fireEvent.change(rounds, { target: { value: '150' } });
    expect(rounds).toHaveValue(99);
  });

  it('saves, reopens, and idempotently maintains the workout ID', async () => {
    const { draftRepository } = await import('../../../repositories/DraftRepository');
    const workoutId = 'test-reopen-id';
    const mockDraft: Workout = {
      workoutId,
      schemaVersion: 'humanv1.workout/1',
      title: 'Reopened Workout',
      discipline: 'STRENGTH' as const,
      catalogueReleaseId: 'v1',
      tags: [],
      blocks: [{ blockId: 'test-block', type: 'EXERCISE', exerciseId: 'bench-press', exerciseNameSnapshot: 'Bench Press', efforts: [{ effortId: 'eff-1', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'p1', metricKey: 'repetition_count', targetValue: 10, canonicalUnit: 'count', position: 0 }, { prescriptionId: 'p2', metricKey: 'external_load', targetValue: 50, canonicalUnit: 'kg', position: 1 }] }] }]
    };
    await draftRepository.saveWorkoutDraft(mockIdentity.humanUserId, mockDraft);
    const checkDraft = await draftRepository.getWorkoutDraft(mockIdentity.humanUserId, workoutId);
    console.log("DRAFT AFTER SAVE:", JSON.stringify(checkDraft, null, 2));

    render(
      <MemoryRouter initialEntries={['/workouts/' + workoutId]}>
        <Routes>
          <Route path="/workouts/:workoutId" element={<WorkoutBuilder identity={mockIdentity} />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Reopened Workout')).toBeInTheDocument();
    });

    const titleInput = screen.getByDisplayValue('Reopened Workout');


    fireEvent.change(titleInput, { target: { value: 'Modified Title' } });

    await waitFor(() => {
      expect(screen.getByText('Saved')).toBeInTheDocument();
    }, { timeout: 3000 });

    const savedDraft = await draftRepository.getWorkoutDraft(mockIdentity.humanUserId, workoutId);
    expect(savedDraft).not.toBeNull();
    expect(savedDraft?.title).toBe('Modified Title');
    expect(savedDraft?.workoutId).toBe(workoutId);
  });

});

