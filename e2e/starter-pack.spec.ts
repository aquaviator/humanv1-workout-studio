import { expect, test, type Page } from '@playwright/test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const projectId = 'demo-humanv1-workout-studio';
const owner = 'human_browserowner01';
if (!projectId.startsWith('demo-') || String(projectId) === 'hv1-platform') throw new Error('Starter Pack browser acceptance refuses non-demo projects');

async function database() {
  if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8081') throw new Error('Starter Pack acceptance requires the isolated Firestore emulator');
  const app = initializeApp({ projectId }, `starter-pack-${crypto.randomUUID()}`);
  return { app, db: getFirestore(app) };
}
async function snapshot() {
  const { app, db } = await database();
  try {
    const names = ['workoutDrafts','planDrafts','planDraftDependencies','planDraftSaveAudits','publishedWorkouts','publishedPlans','workoutDeliveryAcks','planDeliveryAcks','commands','occurrences','sessions','loggedSets'];
    const values = await Promise.all(names.map(name => db.collection(`users/${owner}/${name}`).get()));
    return Object.fromEntries(names.map((name, index) => [name, values[index].size]));
  } finally { await deleteApp(app); }
}
async function signIn(page: Page, path = '/') {
  await page.goto(path); const signIn = page.getByRole('button', { name: /Sign in/ }); const dashboard = page.getByRole('heading', { name: 'Dashboard' });
  await expect(signIn.or(dashboard)).toBeVisible(); if (await signIn.isVisible().catch(() => false)) await signIn.click(); await expect(dashboard).toBeVisible();
}

test('genuine registered Starter Pack journey is atomic, idempotent and read-only safe', async ({ page, context }) => {
  const errors: string[] = []; page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await signIn(page);
  await page.evaluate(() => { (window as any).__HV1_STARTER_PACK_AFTER_WORKOUT_SAVED__ = async (count: number) => { if (count === 3) throw new Error('BROWSER_TEST_INTERRUPT_AFTER_WORKOUT_3'); }; });
  const opener = page.getByRole('button', { name: 'Preview Starter Pack' }); await opener.click(); const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('8'); await expect(dialog).toContainText('10 weeks'); await expect(dialog).toContainText('CARDIO, MOBILITY, STRENGTH');
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  await page.getByRole('button', { name: 'Add Starter Pack' }).click(); const confirmation = dialog.getByLabel(/Type ADD STARTER PACK/); const add = dialog.getByRole('button', { name: 'Add Starter Pack' });
  await confirmation.fill('ADD STARTER'); await expect(add).toBeDisabled(); await confirmation.fill('ADD STARTER PACK'); await expect(add).toBeEnabled();
  await add.click(); await expect(page.getByRole('status').filter({ hasText: 'Needs attention' })).toBeVisible(); await page.close();
  // The first three drafts are durable in IndexedDB. A background upload may
  // acknowledge any prefix before the page closes, but it must never expose a
  // plan or more than those three new workout drafts at this boundary.
  const interrupted = await snapshot();
  expect(interrupted.workoutDrafts).toBeGreaterThanOrEqual(1);
  expect(interrupted.workoutDrafts).toBeLessThanOrEqual(4);
  expect(interrupted.planDrafts).toBe(0);
  const resumed = await context.newPage(); resumed.on('console', event => { if (event.type() === 'error') errors.push(event.text()); }); await signIn(resumed);
  await resumed.getByRole('button', { name: 'Add Starter Pack' }).click(); const resumedDialog = resumed.getByRole('dialog'); await resumedDialog.getByLabel(/Type ADD STARTER PACK/).fill('ADD STARTER PACK'); await resumedDialog.getByRole('button', { name: 'Add Starter Pack' }).click();
  const added = resumed.getByRole('status').filter({ hasText: 'Starter pack added' }); const attention = resumed.getByRole('status').filter({ hasText: 'Needs attention' });
  await expect(added.or(attention)).toBeVisible({ timeout: 60_000 });
  if (await attention.isVisible().catch(() => false)) {
    await resumedDialog.getByText('Reviewer details').click();
    throw new Error(`Starter Pack recovery stopped: ${await resumedDialog.locator('details').innerText()}`);
  }
  const first = await snapshot(); expect(first).toMatchObject({ workoutDrafts: 9, planDrafts: 1, planDraftDependencies: 57, planDraftSaveAudits: 1, publishedWorkouts: 0, publishedPlans: 0, workoutDeliveryAcks: 0, planDeliveryAcks: 0, commands: 0, occurrences: 0, sessions: 0, loggedSets: 0 });
  const { app, db } = await database(); try { const existing = await db.doc(`users/${owner}/workoutDrafts/workout_existing_lower_body`).get(); expect(existing.data()?.payload?.title).toBe('Lower Body Day'); expect(existing.data()?.revision).toBe(1); } finally { await deleteApp(app); }
  await resumedDialog.getByRole('button', { name: 'Add Starter Pack' }).click(); await expect(resumed.getByRole('status').filter({ hasText: 'already added' })).toBeVisible(); expect(await snapshot()).toEqual(first);

  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await signIn(mobile, '/?acceptance=read-only'); await mobile.getByRole('button', { name: 'Preview Starter Pack' }).click();
  await expect(mobile.getByRole('dialog')).toContainText('cannot create or change drafts'); await expect(mobile.getByRole('button', { name: 'Add Starter Pack' })).toHaveCount(0); expect(await snapshot()).toEqual(first);
  expect(errors).toEqual([]);
});
