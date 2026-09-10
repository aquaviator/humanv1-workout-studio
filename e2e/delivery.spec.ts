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
  await page.getByRole('button', { name: 'Add Rest' }).click();
  await expect(page.getByRole('button', { name: 'Send to my apps' })).toBeEnabled();
}

async function latestPublication() {
  const { app, db } = await adminDb();
  try {
    const snapshot = await db.collection(`users/${owner}/publishedWorkouts`).get();
    return snapshot.docs.map(item => item.data()).sort((a, b) => b.revision - a.revision)[0];
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
  test('online, offline restart, reconnect, exact acknowledgement, keyboard, mobile and accessibility', async () => {
    await rm(profile, { recursive: true, force: true });
    await mkdir(profile, { recursive: true });
    let context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 1440, height: 900 } });
    let { page } = await openSignedIn(context);
    await makeValid(page);

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
    await expect(page.getByRole('heading', { name: 'Workout sent to HumanV1' })).toBeVisible();
    await expect(page.getByText('Available in your apps')).toHaveCount(0);
    const first = await latestPublication();
    expect(first.revision).toBe(1);

    await page.context().setOffline(true);
    await page.getByLabel('Workout Title').fill('Browser delivery acceptance revision 2');
    await expect(page.getByText('Saving...', { exact: true })).toBeVisible();
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await send.click();
    await page.getByRole('button', { name: 'Send to my apps' }).last().click();
    await expect(page.getByRole('heading', { name: 'Queued — will send when connected' })).toBeVisible();
    expect((await latestPublication()).revision).toBe(1);
    await page.close();
    page = await context.newPage();
    await page.goto('/workouts', { waitUntil: 'commit' }).catch(() => undefined);
    await context.setOffline(false);
    await page.goto('/workouts');
    await expect(page.getByText('Browser delivery acceptance revision 2')).toBeVisible();
    await expect.poll(async () => (await latestPublication())?.revision).toBe(2);

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
    await expect(page.getByRole('heading', { name: 'Available in your apps' })).toBeVisible();
    expect(revision2.revision).toBe(2);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Browser delivery acceptance revision 2')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await seriousAxeViolations(page)).toEqual([]);
    await context.close();

    context = await chromium.launchPersistentContext(profile, { headless: true, viewport: { width: 390, height: 844 } });
    ({ page } = await openSignedIn(context));
    await page.goto('/workouts');
    await expect(page.getByRole('heading', { name: 'Available in your apps' })).toBeVisible();
    await expect(page.getByText('Workout sent to HumanV1')).toHaveCount(0);
    await context.close();
  });
});
