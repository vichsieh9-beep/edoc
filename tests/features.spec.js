// Feature parity smoke tests (EDOC_HANDOFF.md §10) — lock current behavior before refactoring.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openDoc, startRevision, acceptRevision, placeCaret, renderedDiff, DOC_URL } from './helpers.js';

const DOC_FILE = fileURLToPath(new URL('../documents/qa-senior-game-qa/index.html', import.meta.url));

async function editDraft(page) {
  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
}

async function download(page, button, testInfo, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator(button).click()]);
  const path = testInfo.outputPath(name);
  await dl.saveAs(path);
  return path;
}

test('zero-input revision: 開始修訂 opens the Draft with no form', async ({ page }) => {
  await openDoc(page);
  await page.locator('#newRevisionBtn').click();
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#editorBackdrop')).not.toBeVisible();
  await expect(page.locator('#revisionMeta')).toContainText('編輯者：未設定');
});

test('formal versions are read-only', async ({ page }) => {
  await openDoc(page);
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#editState')).toHaveText('正式版：唯讀');
  await expect(page.locator('#acceptRevisionBtn')).toBeDisabled();
});

test('optional editor name is stored per browser and recorded on the version', async ({ page }) => {
  await openDoc(page);
  await page.locator('#editorBtn').click();
  await page.locator('#editorNameInput').fill('Vic');
  await page.locator('#saveEditorBtn').click();
  await expect(page.locator('#editorBtn')).toHaveText('編輯者：Vic');

  await page.reload();
  await expect(page.locator('#editorBtn')).toHaveText('編輯者：Vic');
  await editDraft(page);
  await expect(page.locator('#revisionMeta')).toContainText('編輯者：Vic');
  await acceptRevision(page, 'v0.8');
  await expect(page.locator('#detailList')).toContainText('編輯者：Vic');
});

test('Published badge and copy public URL over http', async ({ page, browserName, context }) => {
  await openDoc(page);
  await expect(page.locator('#publishStatus')).toHaveText('Published');
  await expect(page.locator('#shareUrlBtn')).toBeEnabled();
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#shareUrlBtn').click();
  await expect(page.locator('#shareUrlBtn')).toHaveText('已複製網址');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
});

test('Local badge and disabled copy URL over file://', async ({ page }) => {
  await page.goto('file://' + DOC_FILE);
  await expect(page.locator('#publishStatus')).toHaveText('Local');
  await expect(page.locator('#shareUrlBtn')).toBeDisabled();
});

test('revision package round trip: export → import → accept', async ({ page }, testInfo) => {
  await openDoc(page);
  await editDraft(page);
  const pkgPath = await download(page, '#exportRevisionBtn', testInfo, 'draft.edoc-revision.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  expect(pkg).toMatchObject({ edocRevisionPackage: true, documentId: 'qa-senior-game-qa-engineer' });
  expect(pkg.revision).toMatchObject({ baseVersion: 'v0.7', status: 'draft' });
  expect(pkg.revision.baseHash).toMatch(/^[0-9a-f]{64}$/);

  await page.goto(DOC_URL); // fresh maintainer session
  await page.locator('#importFile').setInputFiles(pkgPath);
  await expect(page.locator('#revisionTitle')).toHaveText('Imported Revision');
  await expect(page.locator('#revisionStatus')).toHaveText('Imported');
  await expect(page.locator('#acceptRevisionBtn')).toHaveText('接受為新版本');
  await expect(page.locator('#acceptRevisionBtn')).toBeEnabled();
  await acceptRevision(page, 'v0.8');
  const d = await renderedDiff(page);
  expect(d.blue).toBe('嚴謹');
  expect(d.red).toBe('');
});

test('importing a revision based on an older version is a Conflict and cannot be accepted', async ({ page }, testInfo) => {
  await openDoc(page);
  await editDraft(page);
  const pkgPath = await download(page, '#exportRevisionBtn', testInfo, 'stale.edoc-revision.json');

  await page.goto(DOC_URL);
  await startRevision(page);
  await placeCaret(page, '進行初步', 'end');
  await page.keyboard.press('Backspace');
  await acceptRevision(page, 'v0.8'); // Current moves past the package's base

  await page.locator('#importFile').setInputFiles(pkgPath);
  await expect(page.locator('#revisionStatus')).toHaveText('Conflict');
  await expect(page.locator('#revisionPanel')).toHaveClass(/conflict/);
  await expect(page.locator('#acceptRevisionBtn')).toBeDisabled();
});

test('review HTML export is self-contained and carries new versions', async ({ page }, testInfo) => {
  await openDoc(page);
  await editDraft(page);
  await acceptRevision(page, 'v0.8');
  const htmlPath = await download(page, '#exportReviewBtn', testInfo, 'review.html');

  await page.goto('file://' + htmlPath);
  await expect(page.locator('#versionLabel')).toHaveText('v0.8 · Current');
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  const d = await renderedDiff(page);
  expect(d.blue).toBe('嚴謹');
  const external = await page.evaluate(() =>
    [...document.querySelectorAll('script[src], link[rel="stylesheet"][href]')].length,
  );
  expect(external).toBe(0);
});
