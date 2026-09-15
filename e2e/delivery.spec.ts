import { expect, test, chromium, type BrowserContext, type Page } from '@playwright/test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const projectId = 'demo-humanv1-workout-studio';
const owner = 'human_browser_owner';
const profile = resolve('.playwright-profile', 'delivery');
const require = createRequire(import.meta.url);

async function adminDb() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8081') throw new Error('Refusing non-emulator Firestore');
  const app = initializeApp({ projectId }, `browser-test-${Date.now()}`);
  return { app, db: getFirestore(app) };
}

async function openSignedIn(context: BrowserContext) {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().replace(/browser-owner@example\.test/g, '[redacted]')); });
  await page.goto('/workouts/new');
  const signIn = page.getByRole('button', { name: /Sign in/ });
  if (await signIn.isVisible().catch(() => false)) await signIn.click();
  await expect(page.getByLabel('Workout Title')).toBeVisible();
  return { page, consoleErrors };
}

async function makeValid(page: Page) {
  await page.getByLabel('Workout Title').fill('Browser delivery acceptance');
  await page.getByRole('button', { name: 'Add Exercise' }).click();
  await page.getByRole('button', { name: /Push Up/ }).click();
  await expect(page.getByRole('button', { name: 'Send to my apps' })).toBeEnabled();
}

async function latestPublication() {
  const { app, db } = await adminDb();
  try {
    const snapshot = await db.collection(`users/${owner}/publishedWorkouts`).get();
    return snapshot.docs.map(item => item.data()).sort((a, b) => b.revision - a.revision)[0];
  } finally { await deleteApp(app); }
}

async function planPublications(planId?: string) {
  const { app, db } = await adminDb();
  try {
    const snapshot = await db.collection(`users/${owner}/publishedPlans`).get();
    return snapshot.docs.map(item => item.data()).filter(item => !planId || item.globalId === planId).sort((a, b) => b.revision - a.revision);
  } finally { await deleteApp(app); }
}

async function planDraftIds() {
  const { app, db } = await adminDb();
  try { return (await db.collection(`users/${owner}/planDrafts`).get()).docs.map(item => item.id).sort(); }
  finally { await deleteApp(app); }
}

async function seedPlanDependencyDraft() {
  const { app, db } = await adminDb();
  try {
    const now = new Date().toISOString();
    await db.doc(`users/${owner}/workoutDrafts/workout_plan_dependency`).set({
      schemaVersion: 1, globalId: 'workout_plan_dependency', humanUserId: owner, revision: 1, status: 'DRAFT',
      createdAt: now, updatedAt: now, deletedAt: null, originClientId: 'browser_fixture',
      payload: { schemaVersion: 'humanv1.workout/1', workoutId: 'workout_plan_dependency', title: 'Browser plan dependency', discipline: 'STRENGTH', catalogueReleaseId: 'browser-catalogue', tags: ['synthetic'], blocks: [{ blockId: 'exercise_plan_dependency', type: 'EXERCISE', exerciseId: 'browser_push_up', exerciseNameSnapshot: 'Push Up', efforts: [{ effortId: 'effort_plan_dependency', effortType: 'WORKING', prescriptions: [{ prescriptionId: 'rx_plan_dependency', metricKey: 'repetitions', targetValue: 10, canonicalUnit: 'repetitions' }] }] }] },
    });
  } finally { await deleteApp(app); }
}

async function writeAck(overrides: Record<string, unknown> = {}) {
  const publication = await latestPublication();
  if (!publication) throw new Error('Publication missing');
  const { app, db } = await adminDb();
  try {
    const id = `ack_${String(overrides.case ?? 'exact')}`;
    await db.doc(`users/${owner}/workoutDeliveryAcks/${id}`).set({
      schemaVersion: 1, acknowledgementId: id, humanUserId: owner, workoutGlobalId: publication.globalId,
      versionId: publication.versionId, applicationId: 'HUMAN_STRENGTH', appliedChecksum: publication.contentChecksum,
      sourceRevision: publication.revision, state: 'APPLIED', reasonCode: null, clientAppliedAtMillis: Date.now(), createdAt: Date.now(),
      ...overrides,
    });
  } finally { await deleteApp(app); }
}

async function seriousAxeViolations(page: Page) {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  return page.evaluate(async () => (await (window as unknown as { axe: { run: () => Promise<{ violations: Array<{ impact: string | null; id: string }> }> } }).axe.run()).violations.filter(v => v.impact === 'serious' || v.impact === 'critical'));
}

test.describe.serial('truthful delivery in a genuine persistent browser', () => {
  let context: BrowserContext;
  let page: Page;

  test.beforeAll(async () => {
    await rm(profile, { recursive: true, force: true });
    await mkdir(profile, { recursive: true });
    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 900 } });
    ({ page } = await openSignedIn(context));
    await makeValid(page);
    await page.evaluate(() => navigator.serviceWorker.register('/service-worker.js'));
    await expect.poll(() => page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state ?? registration?.installing?.state ?? registration?.waiting?.state ?? 'missing';
    }), { timeout: 20_000 }).toBe('activated');
  });

  test.afterAll(async () => {
    await context?.close().catch(() => undefined);
  });

  test('confirms an online publication with keyboard-safe controls', async () => {
    const send = page.getByRole('button', { name: 'Send to my apps' });
    await send.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(send).toBeFocused();
    expect(await latestPublication()).toBeUndefined();

    await send.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Continue editing' }).focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();
    await expect(page.getByText('Available in your apps')).toHaveCount(0);
    await expect.poll(async () => (await latestPublication())?.revision).toBe(1);
    const first = await latestPublication();
    expect(first.revision).toBe(1);

    await page.goto('/workouts');
    await expect(page.getByText('Browser delivery acceptance')).toBeVisible();
    await page.getByText('Browser delivery acceptance').click();
    await expect(page.getByLabel('Workout Title')).toBeVisible();
  });

  test('survives a closed-process offline restart and replays on reconnect', async () => {
    const send = page.getByRole('button', { name: 'Send to my apps' });
    await page.context().setOffline(true);
    await page.getByLabel('Workout Title').fill('Browser delivery acceptance revision 2');
    await expect(page.getByText('Saving...', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await send.click();
    await page.getByRole('button', { name: 'Send to my apps' }).last().click();
    await expect(page.getByText('Queued — will send when connected', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();
    expect((await latestPublication()).revision).toBe(1);
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 1440, height: 900 } });
    page = await context.newPage();
    await page.goto('/workouts');
    await expect(page.getByText('Offline — showing the last verified cloud status.')).toBeVisible();
    await expect(page.getByText('Browser delivery acceptance revision 2')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();
    expect((await latestPublication()).revision).toBe(1);
    await context.setOffline(false);
    await expect(page.getByText('Browser delivery acceptance revision 2')).toBeVisible();
    await expect.poll(async () => (await latestPublication())?.revision).toBe(2);
  });

  test('requires the exact authoritative acknowledgement', async () => {
    const revision2 = await latestPublication();
    await writeAck({ case: 'wrong-checksum', appliedChecksum: '0'.repeat(64) });
    await writeAck({ case: 'wrong-owner', humanUserId: 'human_other_owner' });
    await writeAck({ case: 'wrong-workout', workoutGlobalId: 'workout_other' });
    await writeAck({ case: 'wrong-version', versionId: 'workout_other_r99_invalid' });
    await writeAck({ case: 'malformed', schemaVersion: 99, sourceRevision: 'invalid' });
    await page.reload();
    await expect(page.getByText('Available in your apps')).toHaveCount(0);
    await writeAck({ case: 'exact' });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'On your phone' })).toBeVisible();
    expect(revision2.revision).toBe(2);
  });

  test('recovers an interrupted active send and remains accessible on mobile', async () => {
    // Pause immediately after the durable SENDING transition, sever the real
    // browser network, and prove normal retry completes the same version once.
    await page.getByText('Browser delivery acceptance revision 2').click();
    await page.getByLabel('Workout Title').fill('Browser delivery acceptance interrupted send');
    await expect(page.getByText('Saving...', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.__HV1_TEST_PAUSE_PUBLICATION_SEND__ = () => new Promise<void>((_resolve, reject) => {
        (window as typeof window & { __HV1_TEST_RELEASE_SEND__?: () => void }).__HV1_TEST_RELEASE_SEND__ = () => {
          const failure = Object.assign(new Error('offline during send'), { code: 'unavailable' });
          reject(failure);
        };
      });
    });
    await page.getByRole('button', { name: 'Send to my apps' }).click();
    await page.getByRole('button', { name: 'Send to my apps' }).last().click();
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();
    await context.setOffline(true);
    await page.evaluate(() => (window as typeof window & { __HV1_TEST_RELEASE_SEND__?: () => void }).__HV1_TEST_RELEASE_SEND__?.());
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible({ timeout: 20_000 });
    expect((await latestPublication()).revision).toBe(2);
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, offline: true, viewport: { width: 390, height: 844 } });
    page = await context.newPage();
    await page.goto('/workouts');
    await expect(page.getByText('Browser delivery acceptance interrupted send')).toBeVisible();
    await context.setOffline(false);
    await expect.poll(async () => (await latestPublication())?.revision).toBe(3);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Browser delivery acceptance interrupted send')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } });
    ({ page } = await openSignedIn(context));
    await page.goto('/workouts');
    await expect(page.getByRole('heading', { name: 'Sending to HumanV1' })).toBeVisible();
    await expect(page.getByText('Available in your apps')).toHaveCount(0);
  });

  test('publishes and projects a one-workout plan once while truthfully waiting for the app', async () => {
    await seedPlanDependencyDraft();
    await page.goto('/workouts');
    await expect(page.getByText('Browser plan dependency')).toBeVisible();

    await page.goto('/plans/new', { waitUntil: 'commit' });
    await expect(page).toHaveURL(/\/plans\/[0-9a-f-]{36}$/);
    await expect(page.getByLabel('Plan Title')).toBeVisible();
    await page.getByLabel('Plan Title').fill('Browser plan delivery acceptance');
    const dependencyCard = page.getByText('Browser plan dependency', { exact: true }).locator('xpath=ancestor::div[contains(@class,"group")][1]');
    await dependencyCard.getByLabel('Add workout to day').selectOption('1');
    const planId = new URL(page.url()).pathname.split('/').pop()!;
    expect(await planPublications()).toHaveLength(0);

    await page.getByRole('button', { name: 'Send plan to my apps' }).click();
    await expect(page.getByText('Workouts that will be published automatically:')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    expect(await planPublications()).toHaveLength(0);

    await page.getByRole('button', { name: 'Send plan to my apps' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Waiting for HumanV1' })).toBeVisible();
    await expect.poll(async () => (await planPublications()).length).toBe(1);
    const first = (await planPublications())[0];
    expect(first.globalId).toBe(planId);
    expect(first.payload.weeks[0].placements[0].workoutVersionId).toMatch(/_r\d+_[a-f0-9]{12}$/);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Waiting for HumanV1' })).toBeVisible();
    await page.getByRole('button', { name: 'Send plan to my apps' }).click();
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect.poll(async () => (await planPublications()).length).toBe(1);
    await expect(page.getByText(/Available in Human Strength/i)).toHaveCount(0);
  });

  test('keeps passive acceptance read-only and creates an explicitly confirmed research copy once', async () => {
    const before = await planDraftIds();
    await page.goto('/plans?acceptance=read-only');
    await expect(page.getByText(/Read-only acceptance mode/)).toBeVisible();
    for (const name of ['First Half Ironman', 'Intermediate Half Ironman', 'First Ironman', 'Intermediate Ironman']) {
      await page.getByRole('tab', { name }).click();
      const details = page.getByText('Evidence and limitations');
      if (!(await details.evaluate(node => (node.parentElement as HTMLDetailsElement).open))) await details.click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await seriousAxeViolations(page)).toEqual([]);
    await expect(page.getByTestId(/create-research-copy/)).toHaveCount(0);
    expect(await planDraftIds()).toEqual(before);

    // This is an isolated emulator journey explicitly switching back to normal
    // user mode; production acceptance never clears this tab-scoped boundary.
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('/plans');
    await page.getByRole('tab', { name: 'Intermediate Ironman' }).click();
    await page.getByTestId('create-research-copy-intermediate-ironman-16-week').click();
    await expect(page.getByText(/creates new cloud data/i)).toBeVisible();
    await page.getByRole('button', { name: 'Create cloud copy of Intermediate Ironman' }).click();
    const expectedCopyId = 'research_copy_4b9b6a3adb81e4eb7443';
    await expect(page).toHaveURL(new RegExp(expectedCopyId));
    await expect.poll(async () => (await planDraftIds()).filter(id => id === expectedCopyId).length).toBe(1);
    await page.goto('/plans');
    await page.getByRole('tab', { name: 'Intermediate Ironman' }).click();
    await page.getByTestId('create-research-copy-intermediate-ironman-16-week').click();
    await page.getByRole('button', { name: 'Create cloud copy of Intermediate Ironman' }).click();
    expect((await planDraftIds()).filter(id => id === expectedCopyId)).toHaveLength(1);
  });
});
