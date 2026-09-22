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
async function planFingerprint() {
  const { app, db } = await database();
  try {
    const plan = await db.collection(`users/${owner}/planDrafts`).get();
    const dependencies = await db.collection(`users/${owner}/planDraftDependencies`).orderBy('dependencyId').get();
    const audits = await db.collection(`users/${owner}/planDraftSaveAudits`).get();
    return {
      plan: plan.docs.map(item => ({ id: item.id, revision: item.data().revision, updatedAt: item.data().updatedAt, checksum: item.data().contentChecksum })),
      dependencies: dependencies.docs.map(item => ({ id: item.id, revision: item.data().revision, updatedAt: item.data().updatedAt })),
      audits: audits.docs.map(item => ({ id: item.id, revision: item.data().resultRevision, updatedAt: item.data().updatedAt })).sort((a, b) => a.id.localeCompare(b.id)),
    };
  } finally { await deleteApp(app); }
}
async function authToken() {
  const response = await fetch('http://127.0.0.1:9098/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'browser-owner@example.test', password: 'browser-password-123', returnSecureToken: true }),
  });
  if (!response.ok) throw new Error(`Emulator sign-in failed: ${response.status}`);
  return (await response.json() as { idToken: string }).idToken;
}
async function invokeCallable(token: string, data: Record<string, unknown>) {
  const response = await fetch('http://127.0.0.1:5001/demo-humanv1-workout-studio/europe-west1/saveStudioPlanDraft', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ data }),
  });
  const body = await response.json() as any;
  if (!response.ok || body.error) throw new Error(`Callable failed: ${JSON.stringify(body.error ?? response.status)}`);
  return body.result as { revision: number; status: string; idempotent: boolean };
}
async function signIn(page: Page, path = '/') {
  await page.goto(path); const signIn = page.getByRole('button', { name: /Sign in/ }); const dashboard = page.getByRole('heading', { name: 'Dashboard' });
  await expect(signIn.or(dashboard)).toBeVisible(); if (await signIn.isVisible().catch(() => false)) await signIn.click(); await expect(dashboard).toBeVisible();
}

test('genuine registered Starter Pack journey is atomic, idempotent and read-only safe', async ({ page, context }) => {
  const errors: string[] = []; page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  let capturedSave: Record<string, unknown> | undefined; let callableRequests = 0;
  page.on('request', request => { if (request.url().includes('saveStudioPlanDraft')) { callableRequests++; capturedSave = request.postDataJSON()?.data; } });
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
  resumed.on('request', request => { if (request.url().includes('saveStudioPlanDraft')) { callableRequests++; capturedSave = request.postDataJSON()?.data; } });
  await resumed.getByRole('button', { name: 'Add Starter Pack' }).click(); const resumedDialog = resumed.getByRole('dialog'); await resumedDialog.getByLabel(/Type ADD STARTER PACK/).fill('ADD STARTER PACK'); await resumedDialog.getByRole('button', { name: 'Add Starter Pack' }).click();
  const added = resumed.getByRole('status').filter({ hasText: 'Starter pack added' }); const attention = resumed.getByRole('status').filter({ hasText: 'Needs attention' });
  await expect(added.or(attention)).toBeVisible({ timeout: 60_000 });
  if (await attention.isVisible().catch(() => false)) {
    await resumedDialog.getByText('Reviewer details').click();
    throw new Error(`Starter Pack recovery stopped: ${await resumedDialog.locator('details').innerText()}`);
  }
  const first = await snapshot(); const firstFingerprint = await planFingerprint(); expect(first).toMatchObject({ workoutDrafts: 9, planDrafts: 1, planDraftDependencies: 57, planDraftSaveAudits: 1, publishedWorkouts: 0, publishedPlans: 0, workoutDeliveryAcks: 0, planDeliveryAcks: 0, commands: 0, occurrences: 0, sessions: 0, loggedSets: 0 });
  const { app, db } = await database(); try { const existing = await db.doc(`users/${owner}/workoutDrafts/workout_existing_lower_body`).get(); expect(existing.data()?.payload?.title).toBe('Lower Body Day'); expect(existing.data()?.revision).toBe(1); } finally { await deleteApp(app); }
  const beforeReplayRequests = callableRequests;
  await resumedDialog.getByRole('button', { name: 'Add Starter Pack' }).click(); await expect(resumed.getByRole('status').filter({ hasText: 'already added' })).toBeVisible();
  expect(callableRequests).toBe(beforeReplayRequests); expect(await snapshot()).toEqual(first); expect(await planFingerprint()).toEqual(firstFingerprint);

  expect(capturedSave).toBeDefined(); const token = await authToken();
  const exact = await invokeCallable(token, capturedSave!); expect(exact).toMatchObject({ revision: 1, status: 'SAVED', idempotent: true });
  expect(await planFingerprint()).toEqual(firstFingerprint);
  const edit = structuredClone(capturedSave!); (edit as any).create = false; (edit as any).expectedRevision = 1;
  (edit as any).requestKey = 'browser-controlled-title-edit'; delete (edit as any).expectedContentChecksum;
  (edit as any).plan.title = `${(edit as any).plan.title} — edited`;
  const edited = await invokeCallable(token, edit); expect(edited).toMatchObject({ revision: 2, status: 'SAVED', idempotent: false });
  const editedFingerprint = await planFingerprint(); expect(editedFingerprint.audits).toHaveLength(2); expect(editedFingerprint.plan[0].revision).toBe(2);
  const editReplay = await invokeCallable(token, edit); expect(editReplay).toMatchObject({ revision: 2, status: 'SAVED', idempotent: true });
  expect(await planFingerprint()).toEqual(editedFingerprint);

  const mobile = await context.newPage(); await mobile.setViewportSize({ width: 390, height: 844 }); await signIn(mobile, '/?acceptance=read-only'); await mobile.getByRole('button', { name: 'Preview Starter Pack' }).click();
  await expect(mobile.getByRole('dialog')).toContainText('cannot create or change drafts'); await expect(mobile.getByRole('button', { name: 'Add Starter Pack' })).toHaveCount(0); expect(await planFingerprint()).toEqual(editedFingerprint);
  expect(errors).toEqual([]);
});
