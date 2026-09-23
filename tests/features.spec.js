// Feature parity smoke tests (EDOC_HANDOFF.md §10) — lock current behavior before refactoring.
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
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

// Script-injection attempts a reviewer could hide in a returned revision (none add visible text).
const PAYLOADS =
  '<img src=x onerror="window.__pwned=1">' +
  '<script>window.__pwned=2</script>' +
  '<svg onload="window.__pwned=3"></svg>' +
  '<iframe srcdoc="<script>parent.__pwned=4</script>"></iframe>' +
  '<img src="javascript:window.__pwned=5">' +
  '<a href=" java&#9;script:window.__pwned=6"></a>' +
  '<span onmouseover="window.__pwned=7" style="position:fixed;inset:0"></span>' +
  '<object data="data:text/html,<script>parent.__pwned=8</script>"></object>' +
  '<details open ontoggle="window.__pwned=9"></details>' +
  '<span id="revisionData"></span>';

async function expectImportSanitized(page) {
  await expect(page.locator('#revisionTitle')).toHaveText('Imported Revision');
  await page.mouse.move(300, 400);
  await page.waitForTimeout(500); // give error/load/toggle events a chance to fire
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  const leftovers = await page.evaluate(() => {
    const doc = document.getElementById('doc');
    const bad = [...doc.querySelectorAll('script, style, iframe, svg, object, details, [style], [id]')].map((e) => e.outerHTML);
    for (const el of doc.querySelectorAll('*'))
      for (const a of el.attributes)
        if (/^on/i.test(a.name) || /^\s*(javascript|data):/i.test(a.value)) bad.push(el.outerHTML);
    return bad;
  });
  expect(leftovers).toEqual([]);
  await expect(page.locator('#acceptRevisionBtn')).toBeEnabled();
  await acceptRevision(page, 'v0.8');
  const d = await renderedDiff(page);
  expect(d.blue).toBe('嚴謹');
  expect(d.red).toBe('');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
}

test('imported revision package is sanitized: injected scripts never run, content still accepted', async ({ page }, testInfo) => {
  await openDoc(page);
  await editDraft(page);
  const pkgPath = await download(page, '#exportRevisionBtn', testInfo, 'draft.edoc-revision.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  expect(pkg.revision.html).toContain('並持續嚴謹追蹤');
  pkg.revision.html = pkg.revision.html.replace('並持續嚴謹追蹤', '並持續嚴謹追蹤' + PAYLOADS);
  const evilPath = testInfo.outputPath('evil.edoc-revision.json');
  await writeFile(evilPath, JSON.stringify(pkg));

  await page.goto(DOC_URL);
  await page.locator('#importFile').setInputFiles(evilPath);
  await expectImportSanitized(page);
});

test('imported review HTML is sanitized: scripts in the file and in its revision never run', async ({ page }, testInfo) => {
  await openDoc(page);
  const { baseHash, html } = await page.evaluate(async () => ({
    baseHash: await ensureHash('v0.7'),
    html: cleanSnapshot(VERSION_DATA['v0.7'].html),
  }));
  const revision = {
    id: 'rev-evil', label: 'Draft', baseVersion: 'v0.7', baseHash, status: 'draft',
    author: '<img src=x onerror="window.__pwned=10">', createdAt: '2026-09-22T00:00:00.000Z',
    documentId: 'qa-senior-game-qa-engineer',
    html: html.replace('並持續追蹤', '並持續嚴謹追蹤' + PAYLOADS),
  };
  const json = (v) => JSON.stringify(v).replace(/<\//g, '<\\/');
  const file = `<!DOCTYPE html><html><body><img src=x onerror="window.__pwned=11"><script>window.__pwned=12</script>
<script id="documentState" type="application/json">${json({ documentId: 'qa-senior-game-qa-engineer' })}</script>
<script id="revisionData" type="application/json">${json([revision])}</script></body></html>`;
  const evilPath = testInfo.outputPath('evil-review.html');
  await writeFile(evilPath, file);

  await page.locator('#importFile').setInputFiles(evilPath);
  await expect(page.locator('#revisionMeta')).toContainText('編輯者：<img src=x');
  await expectImportSanitized(page);
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
