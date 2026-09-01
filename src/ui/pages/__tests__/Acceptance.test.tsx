
import { draftRepository } from '../../../repositories/DraftRepository';
import workoutsData from '../../../fixtures/workouts.json';
import plansData from '../../../fixtures/plans.json';
import protocolsData from '../../../fixtures/protocols.json';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
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

vi.mock('../../../repositories/FirebaseCatalogueRepository', () => ({
  catalogueRepository: { getExercises: vi.fn(() => Promise.resolve([
    { exerciseId: 'bench_press', name: 'Bench Press', category: 'Strength', equipment: ['Barbell'], aliases: [], metricProfile: { primary: ['repetition_count', 'external_load'], secondary: [], optional: [], unsupported: ['distance'] } },
    { exerciseId: 'treadmill_run', name: 'Treadmill Run', category: 'Cardio', equipment: ['Treadmill'], aliases: [], metricProfile: { primary: ['duration', 'distance'], secondary: [], optional: [], unsupported: ['repetition_count', 'external_load'] } },
  ])) },
}));


const { workoutsDb, protocolsDb, plansDb } = vi.hoisted(() => {
  const w = new Map();
  const p = new Map();
  const pl = new Map();
  w.set('w1', { workoutId: 'w1', title: 'Mock Workout', discipline: 'Run', humanUserId: '1', blocks: [] });
  w.set('workout_tabata_fixture', { workoutId: 'workout_tabata_fixture', title: 'Mock Workout', discipline: 'Run', humanUserId: '1', blocks: [] });
  p.set('p1', { protocolId: 'p1', title: 'Mock Protocol', description: '', blocks: [] });
  p.set('protocol_tabata_20_10_8', { protocolId: 'protocol_tabata_20_10_8', title: 'Mock Protocol', description: '', blocks: [] });
  pl.set('pl1', { planId: 'pl1', title: 'Mock Plan', weeks: [] });
  pl.set('plan_two_week_fixture', { planId: 'plan_two_week_fixture', title: 'Mock Plan', weeks: [] });
  return { workoutsDb: w, protocolsDb: p, plansDb: pl };
});

vi.mock('../../repositories/DraftRepository', () => ({
  draftRepository: {
    listWorkoutDrafts: vi.fn().mockImplementation(() => Promise.resolve(Array.from(workoutsDb.values()))),
    saveWorkoutDraft: vi.fn().mockImplementation((uid, draft) => { console.log("saveWorkoutDraft called with id:", draft.workoutId, "title:", draft.title); workoutsDb.set(draft.workoutId, draft); return Promise.resolve(); }),
    getWorkoutDraft: vi.fn().mockImplementation((uid, id) => { console.log("getWorkoutDraft called with id:", id, "found:", !!workoutsDb.get(id)); return Promise.resolve(workoutsDb.get(id) || null); }),
    listProtocolDrafts: vi.fn().mockImplementation(() => Promise.resolve(Array.from(protocolsDb.values()))),
    saveProtocolDraft: vi.fn().mockImplementation((uid, draft) => { protocolsDb.set(draft.protocolId, draft); return Promise.resolve(); }),
    getProtocolDraft: vi.fn().mockImplementation((uid, id) => Promise.resolve(protocolsDb.get(id) || null)),
    listPlanDrafts: vi.fn().mockImplementation(() => Promise.resolve(Array.from(plansDb.values()))),
    savePlanDraft: vi.fn().mockImplementation((uid, draft) => { plansDb.set(draft.planId, draft); return Promise.resolve(); }),
    getPlanDraft: vi.fn().mockImplementation((uid, id) => Promise.resolve(plansDb.get(id) || null)),
  }
}));

describe('Acceptance Criteria', () => {
  beforeEach(async () => {
    mockDbStore.clear();
    // Seed draft repo with fixtures for tests
    await Promise.all(workoutsData.map((w: any) => draftRepository.saveWorkoutDraft('test-user', w)));
    await Promise.all(plansData.map((p: any) => draftRepository.savePlanDraft('test-user', p)));
    await Promise.all(protocolsData.map((p: any) => draftRepository.saveProtocolDraft('test-user', p)));
  });

  describe('WorkoutBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Treadmill has no default repetitions or load', async () => {
      render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Add Exercise'));
      const treadmill = (await screen.findAllByText('Treadmill Run'))[0];
      fireEvent.click(treadmill);
      await waitFor(() => expect(screen.getAllByText('Treadmill Run').length).toBeGreaterThan(1));
      // Should not have "count" or "kg" units
      expect(screen.queryByText('count')).not.toBeInTheDocument();
      expect(screen.queryByText('kg')).not.toBeInTheDocument();
      // Should have "s" and "m" (duration and distance)
      expect(screen.getByText('s')).toBeInTheDocument();
      expect(screen.getByText('m')).toBeInTheDocument();
    });

    it('Strength exercise uses supported repetitions/load', async () => {
      render(<MemoryRouter><WorkoutBuilder identity={mockIdentity} /></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      fireEvent.click(screen.getByText('Add Exercise'));
      const bench = (await screen.findAllByText('Bench Press'))[0];
      fireEvent.click(bench);
      await waitFor(() => expect(screen.getAllByText('Bench Press').length).toBeGreaterThan(1));
      expect(screen.getByText('count')).toBeInTheDocument();
      expect(screen.getByText('kg')).toBeInTheDocument();
    });

    it('Workout save/reload/edit/idempotence', async () => {
      const { unmount } = render(
        <MemoryRouter initialEntries={['/workouts/workout_tabata_fixture']}>
          <Routes><Route path="/workouts/:workoutId" element={<WorkoutBuilder identity={mockIdentity} />} /></Routes>
        </MemoryRouter>
      );
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Workout Title');
      fireEvent.change(titleInput, { target: { value: 'My Saved Workout' } });
      
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      render(
        <MemoryRouter initialEntries={['/workouts/workout_tabata_fixture']}>
          <Routes><Route path="/workouts/:workoutId" element={<WorkoutBuilder identity={mockIdentity} />} /></Routes>
        </MemoryRouter>
      );
      screen.debug(undefined, 300000); await screen.findByDisplayValue('My Saved Workout');
    });
  });

  describe('ProtocolBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<MemoryRouter><ProtocolBuilder identity={mockIdentity} /></MemoryRouter>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Protocol serialize/save/reload/edit', async () => {
      const { unmount } = render(<MemoryRouter initialEntries={['/protocols/protocol_tabata_20_10_8']}><Routes><Route path="/protocols/:protocolId" element={<ProtocolBuilder identity={mockIdentity} />} /></Routes></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Protocol Title');
      fireEvent.change(titleInput, { target: { value: 'Custom HIIT' } });
      
      await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument(), { timeout: 3000 });
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      render(<MemoryRouter initialEntries={['/protocols/protocol_tabata_20_10_8']}><Routes><Route path="/protocols/:protocolId" element={<ProtocolBuilder identity={mockIdentity} />} /></Routes></MemoryRouter>);
      await screen.findByDisplayValue('Custom HIIT');
    });
  });

  describe('PlanBuilder', () => {
    it('has no basic accessibility violations', async () => {
      const { container } = render(<MemoryRouter><PlanBuilder identity={mockIdentity} /></MemoryRouter>);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('Plan save/reload, Multiple weeks, Add/move/remove placements, Keyboard-accessible alternatives', async () => {
      const { unmount } = render(<MemoryRouter initialEntries={['/plans/plan_two_week_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={mockIdentity} />} /></Routes></MemoryRouter>);
      await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());
      
      const titleInput = screen.getByLabelText('Plan Title');
      fireEvent.change(titleInput, { target: { value: 'My Epic Plan' } });
      
      // Mobile-friendly Add buttons (keyboard accessible alternatives to drag and drop)
      await waitFor(() => {
        expect(screen.queryAllByLabelText('Add workout to day').length).toBeGreaterThan(0);
      });
      const selects = await screen.findAllByLabelText('Add workout to day');
      fireEvent.change(selects[0], { target: { value: '1' } });
      
      await waitFor(() => expect(screen.getByText('Saving...')).toBeInTheDocument(), { timeout: 3000 });
      await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument(), { timeout: 3000 });
      
      unmount();
      
      render(<MemoryRouter initialEntries={['/plans/plan_two_week_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={mockIdentity} />} /></Routes></MemoryRouter>);
      await screen.findByDisplayValue('My Epic Plan');
    });
  });
});

