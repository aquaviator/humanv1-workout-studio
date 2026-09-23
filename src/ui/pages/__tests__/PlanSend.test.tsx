import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { axe } from 'jest-axe';

const state = vi.hoisted(() => ({
  phases: [] as string[],
  publish: vi.fn(),
  governedPublish: vi.fn(),
  plan: {
    schemaVersion: 'humanv1.plan/1', planId: 'plan_send_fixture', title: 'Plan', description: '',
    weeks: [{ weekId: 'week_1', weekNumber: 1, label: 'Week 1', placements: [{ placementId: 'placement_1', dayOfWeek: 1, workoutId: 'workout_1', workoutVersionId: 'workout_1_v1', preferredMinuteOfDay: null, reminderEnabled: false, notes: '' }] }],
  },
  workout: { schemaVersion: 'humanv1.workout/1', workoutId: 'workout_1', title: 'Andy Test Workout', discipline: 'STRENGTH', catalogueReleaseId: 'fixture', tags: [], blocks: [{ blockId: 'block_1', type: 'EXERCISE', exerciseId: 'squat', exerciseNameSnapshot: 'Squat', efforts: [{ effortId: 'set_1', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'reps_1', metricKey: 'repetitions', targetValue: 5 }] }] }] },
}));

vi.mock('../../../repositories/DraftRepository', () => ({ draftRepository: {
  listWorkoutDrafts: vi.fn(async () => [state.workout]), getPlanDraft: vi.fn(async () => state.plan),
  listWorkoutEnvelopes: vi.fn(async () => [{ schemaVersion: 1, globalId: state.workout.workoutId, humanUserId: 'synthetic_owner', revision: 1, status: 'DRAFT', payload: state.workout, createdAt: '2026-01-01', updatedAt: '2026-01-01', deletedAt: null, originClientId: 'test' }]),
  getPlanEnvelope: vi.fn(async () => ({ revision: 1 })),
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
vi.mock('../../../repositories/GovernedPublicationRepository', () => ({ governedPublicationRepository: {
  publishPlan: state.governedPublish,
  listWorkoutVersions: vi.fn(async () => []),
} }));
vi.mock('../../../repositories/SyncManager', () => ({ syncManager: {
  syncDown: vi.fn(async () => undefined),
  listSyncRecords: vi.fn(async () => []),
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
    state.governedPublish.mockReset();
    state.governedPublish.mockResolvedValue({ planId: 'plan_send_fixture', planVersionId: 'plan_send_fixture_r1_planhash', planRevision: 1,
      planChecksum: 'b'.repeat(64), workoutVersionIds: ['workout_1_r1_workouthash'], reusedPlan: false });
    state.publish.mockImplementation(async (type: string) => type === 'workout'
      ? { globalId: 'workout_1', revision: 1, schemaVersion: 'humanv1.workout/1', versionId: 'workout_1_r1_workouthash', contentChecksum: 'a'.repeat(64), publicationState: 'PUBLISHED' }
      : { versionId: 'plan_send_fixture_r1_planhash', contentChecksum: 'b'.repeat(64), publicationState: 'PUBLISHED' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    state.workout.blocks = [{ blockId: 'block_1', type: 'EXERCISE', exerciseId: 'squat', exerciseNameSnapshot: 'Squat', efforts: [{ effortId: 'set_1', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'reps_1', metricKey: 'repetitions', targetValue: 5 }] }] }];
  });

  it('the confirmation Send button executes dependency and plan publication and never claims device delivery', async () => {
    render(<MemoryRouter initialEntries={['/plans/plan_send_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={{ humanUserId: 'synthetic_owner', email: 'owner@example.test', displayName: 'Owner' }} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue('Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Send plan to my apps' }));
    await screen.findByRole('heading', { name: 'Send plan to my apps' });
    expect((await screen.findAllByText('Andy Test Workout')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(state.governedPublish).toHaveBeenCalledTimes(1));
    expect(state.publish).not.toHaveBeenCalled();
    expect(state.phases).toEqual(['VALIDATING', 'PUBLISHING_WORKOUTS', 'PUBLISHING_PLAN', 'SENDING', 'SENT_TO_HUMANV1', 'WAITING_FOR_HUMANV1']);
    expect(await screen.findByRole('heading', { name: 'Waiting for HumanV1' })).toBeInTheDocument();
    expect(screen.queryByText(/Available in HumanV1/i)).not.toBeInTheDocument();
  });

  it('fails before partial publication and offers an accessible correction instead of deterministic Retry', async () => {
    state.workout.blocks = [];
    render(<MemoryRouter initialEntries={['/plans/plan_send_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={{ humanUserId: 'synthetic_owner', email: 'owner@example.test', displayName: 'Owner' }} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue('Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Send plan to my apps' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: /Cannot send: Andy Test Workout needs attention before this plan can be sent/ })).toBeInTheDocument();
    expect(state.publish).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Review workout' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('DRAFT_DEPENDENCY_INVALID').length).toBeGreaterThan(0);
    for (const alert of screen.getAllByRole('alert')) expect(await axe(alert)).toHaveNoViolations();
  });

  it('keeps transient delivery failures retryable', async () => {
    state.governedPublish.mockRejectedValueOnce(new Error('UPLOAD_FAILED'));
    render(<MemoryRouter initialEntries={['/plans/plan_send_fixture']}><Routes><Route path="/plans/:planId" element={<PlanBuilder identity={{ humanUserId: 'synthetic_owner', email: 'owner@example.test', displayName: 'Owner' }} />} /></Routes></MemoryRouter>);
    await screen.findByDisplayValue('Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Send plan to my apps' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('heading', { name: /Retry required: UPLOAD_FAILED/ })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Retry' }).length).toBeGreaterThan(0);
  });
});
