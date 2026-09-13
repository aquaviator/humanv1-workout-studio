import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const state = vi.hoisted(() => ({
  phases: [] as string[],
  publish: vi.fn(),
  plan: {
    schemaVersion: 'humanv1.plan/1', planId: 'plan_send_fixture', title: 'Plan', description: '',
    weeks: [{ weekId: 'week_1', weekNumber: 1, label: 'Week 1', placements: [{ placementId: 'placement_1', dayOfWeek: 1, workoutId: 'workout_1', workoutVersionId: 'workout_1_v1', preferredMinuteOfDay: null, reminderEnabled: false, notes: '' }] }],
  },
  workout: { schemaVersion: 'humanv1.workout/1', workoutId: 'workout_1', title: 'Andy Test Workout', discipline: 'STRENGTH', catalogueReleaseId: 'fixture', tags: [], blocks: [] },
}));

vi.mock('../../../repositories/DraftRepository', () => ({ draftRepository: {
  listWorkoutDrafts: vi.fn(async () => [state.workout]), getPlanDraft: vi.fn(async () => state.plan),
  savePlanDraft: vi.fn(async () => undefined),
} }));
vi.mock('../../../repositories/CrossAppRepository', () => ({ crossAppRepository: {
  listAppWorkouts: vi.fn(async () => []), listAppPlans: vi.fn(async () => []), deliverPublishedPlan: vi.fn(async () => ({ queued: false, occurrences: 1 })),
} }));
vi.mock('../../../repositories/DeliveryAcknowledgementRepository', () => ({ deliveryAcknowledgementRepository: {
  findExactPlan: vi.fn(async () => null),
} }));
vi.mock('../../../repositories/PublicationRepository', () => ({ publicationRepository: {
  generateChecksum: vi.fn(async () => 'a'.repeat(64)), listPublishedVersions: vi.fn(async () => []),
  publishAuthenticated: state.publish,
} }));
vi.mock('../../../repositories/SyncManager', () => ({ syncManager: {
  listPublicationSyncRecords: vi.fn(async (_owner: string, type: string) => type === 'plan' ? [{ status: 'SYNCED', envelope: { versionId: 'plan_send_fixture_r1_planhash' } }] : []),
  queueUpload: vi.fn(async () => undefined), syncPending: vi.fn(async () => undefined), subscribe: vi.fn(() => () => undefined),
} }));
vi.mock('../../../repositories/PlanDeliveryRepository', () => ({ planDeliveryRepository: {
  load: vi.fn(async () => null), save: vi.fn(async (attempt: { phase: string }) => { state.phases.push(attempt.phase); }),
} }));

import PlanBuilder from '../PlanBuilder';

describe('Plan Send journey', () => {
  beforeEach(() => {
    state.phases.length = 0;
    state.publish.mockReset();
    state.publish.mockImplementation(async (type: string) => type === 'workout'
      ? { versionId: 'workout_1_r1_workouthash', contentChecksum: 'a'.repeat(64), publicationState: 'PUBLISHED' }
      : { versionId: 'plan_send_fixture_r1_planhash', contentChecksum: 'b'.repeat(64), publicationState: 'PUBLISHED' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('the confirmation Send button executes dependency and plan publication and never claims device delivery', async () => {
    render(<MemoryRouter initialEntries={['/plans/plan_send_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={{ humanUserId: 'synthetic_owner', email: 'owner@example.test', displayName: 'Owner' }} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue('Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Send plan to my apps' }));
    await screen.findByRole('heading', { name: 'Send plan to my apps' });
    expect((await screen.findAllByText('Andy Test Workout')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(state.publish).toHaveBeenCalledTimes(2));
    expect(state.publish.mock.calls.map(call => call[0])).toEqual(['workout', 'plan']);
    expect(state.phases).toEqual(['VALIDATING', 'PUBLISHING_WORKOUTS', 'PUBLISHING_PLAN', 'SENDING', 'SENT_TO_HUMANV1', 'WAITING_FOR_HUMANV1']);
    expect(await screen.findByRole('heading', { name: 'Waiting for HumanV1' })).toBeInTheDocument();
    expect(screen.queryByText(/Available in HumanV1/i)).not.toBeInTheDocument();
  });
});
