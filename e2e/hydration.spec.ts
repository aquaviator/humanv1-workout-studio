import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-humanv1-workout-studio';
const owner = 'human_browserowner01';
const planId = 'plan_hydration_acceptance';
const workoutId = 'workout_hydration_acceptance';
if (!projectId.startsWith('demo-')) throw new Error('Hydration acceptance refuses non-demo projects');

const workout = { schemaVersion: 'humanv1.workout/1', workoutId, title: 'Hydration Acceptance Workout', discipline: 'STRENGTH',
  catalogueReleaseId: 'fixture', tags: [], blocks: [{ blockId: 'block-1', type: 'EXERCISE', exerciseId: 'squat', exerciseNameSnapshot: 'Squat',
    efforts: [{ effortId: 'effort-1', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'rx-1', metricKey: 'repetitions', targetValue: 8 }] }] }] };
const placement = { placementId: 'placement-authoritative', dayOfWeek: 3, workoutId, preferredMinuteOfDay: null, reminderEnabled: false, notes: '' };
const plan = { schemaVersion: 'humanv1.studio-plan-draft/1', planId, title: 'Hydration Acceptance Plan', description: '', dependencyOwnerHumanUserId: owner,
  dependencyKinds: ['WORKOUT_DRAFT'], dependencyStorageVersion: 1, dependencyCount: 1,
  weeks: [{ weekId: 'week-1', weekNumber: 1, label: 'Week 1', placements: [placement] }] };
const envelope = (globalId: string, payload: unknown, revision: number) => ({ schemaVersion: 1, globalId, humanUserId: owner, revision, status: 'DRAFT', payload,
  createdAt: '2026-09-24T12:00:00.000Z', updatedAt: `2026-09-24T12:0${revision}:00.000Z`, deletedAt: null, originClientId: 'browser-acceptance' });

async function withDb<T>(run: (db: FirebaseFirestore.Firestore) => Promise<T>) {
  const app = initializeApp({ projectId }, `hydration-${crypto.randomUUID()}`);
  try { return await run(getFirestore(app)); } finally { await deleteApp(app); }
}
async function seedRemote() {
  await withDb(async db => {
    await db.doc(`users/${owner}/workoutDrafts/${workoutId}`).set(envelope(workoutId, workout, 2));
    await db.doc(`users/${owner}/planDrafts/${planId}`).set(envelope(planId, plan, 3));
    await db.doc(`users/${owner}/planDraftDependencies/${planId}__${placement.placementId}`).set({ schemaVersion: 'humanv1.studio-plan-draft-dependency/1',
      dependencyId: `${planId}__${placement.placementId}`, humanUserId: owner, planId, placementId: placement.placementId, dependencyKind: 'WORKOUT_DRAFT',
      referencedStableId: workoutId, expectedRevision: 2, expectedUpdatedAt: '2026-09-24T12:02:00.000Z', immutableVersionId: null,
      immutableRevision: null, immutableChecksum: null, immutableSchemaVersion: null, displayName: workout.title, provenance: 'WORKOUT_STUDIO', revision: 3,
      createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:03:00.000Z', deletedAt: null });
  });
}
async function fingerprint() {
  return withDb(async db => {
    const names = ['workoutDrafts', 'planDrafts', 'planDraftDependencies', 'planDraftSaveAudits', 'publishedWorkouts', 'publishedPlans'];
    const snaps = await Promise.all(names.map(name => db.collection(`users/${owner}/${name}`).get()));
    return Object.fromEntries(names.map((name, index) => [name, snaps[index].docs.map(doc => `${doc.id}:${doc.updateTime.toMillis()}`).sort()]));
  });
}
async function signIn(page: Page) {
  await page.goto('/'); const signIn = page.getByRole('button', { name: /Sign in/ });
  await expect(signIn.or(page.getByRole('heading', { name: 'Dashboard' }))).toBeVisible();
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
}
async function seedStaleCache(page: Page) {
  const stale = { ...plan, dependencyKinds: [], dependencyCount: 0, weeks: [{ ...plan.weeks[0], placements: [
    { ...placement, placementId: 'placement-stale' }, placement,
  ] }] };
  await page.evaluate(async ({ owner, planId, workoutId, stale, workout }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const request = indexedDB.open('keyval-store', 1); request.onupgradeneeded = () => request.result.createObjectStore('keyval'); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const put = (key: string, value: unknown) => new Promise<void>((resolve, reject) => { const transaction = db.transaction('keyval', 'readwrite'); transaction.objectStore('keyval').put(value, key); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    const base = { schemaVersion: 1, humanUserId: owner, revision: 1, status: 'DRAFT', createdAt: '2026-09-24T12:00:00.000Z', updatedAt: '2026-09-24T12:01:00.000Z', deletedAt: null, originClientId: 'stale-browser' };
    await put(`drafts_${owner}_workout_${workoutId}`, { ...base, globalId: workoutId, payload: workout });
    await put(`drafts_${owner}_plan_${planId}`, { ...base, globalId: planId, payload: stale });
    db.close();
  }, { owner, planId, workoutId, stale, workout });
}
async function verifyCorrected(page: Page) {
  await page.goto(`/plans/${planId}?acceptance=read-only`);
  await expect(page.getByRole('heading', { name: plan.title })).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'Needs attention' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Wednesday schedule' }).locator('article').filter({ hasText: workout.title })).toHaveCount(1);
  await expect(page.locator('html')).not.toHaveCSS('overflow-x', 'scroll');
}

test('newer authoritative plan hydration removes stale duplicates without cloud writes', async ({ browser }: { browser: Browser }) => {
  await seedRemote(); const before = await fingerprint(); const errors: string[] = [];
  let context: BrowserContext = await browser.newContext(); let page = await context.newPage();
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await signIn(page); await seedStaleCache(page); await verifyCorrected(page);
  await page.goto('/workouts?acceptance=read-only'); await page.goBack(); await verifyCorrected(page); await page.reload(); await verifyCorrected(page);
  const state = await context.storageState({ indexedDB: true }); await context.close();
  context = await browser.newContext({ storageState: state }); page = await context.newPage();
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); }); await verifyCorrected(page);
  await page.setViewportSize({ width: 390, height: 844 }); await verifyCorrected(page);
  expect(await fingerprint()).toEqual(before); expect(errors).toEqual([]); await context.close();
});
