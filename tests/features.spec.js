// Page features: header layout, edit links, publishing, drafts, sharing, safety.
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, bundleRuntime, loadTemplates, renderDocument } from '../scripts/lib/site.mjs';
import { createFakeGithub, repoDocument, testLinks } from './fake-github.js';
import { enablePublishing } from './publish-mock.js';
import { openDoc, startRevision, acceptRevision, placeCaret, renderedDiff, TEST_TOKEN, TEST_NAME, DOC_URL } from './helpers.js';

async function editAndPublish(page) {
  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
  await acceptRevision(page, 'v0.8');
}

test('header: title on top, reading controls, then editing and sharing; engine version in the footer', async ({ page }) => {
  await openDoc(page);
  const head = page.locator('#docHead');
  await expect(head.locator('.doc-title')).toHaveText('【QA】資深遊戲測試工程師');
  await expect(head.locator('.read-bar #versionButton')).toBeVisible();
  await expect(head.locator('.read-bar #toggleChanges')).toHaveText('顯示變更：開');
  await expect(head.locator('#editGroup')).toContainText('正式版・唯讀');
  await expect(head.locator('.share-group')).toHaveText(/複製公開網址\s*複製全文\s*下載 PDF/);
  await expect(head).not.toContainText('Engine');
  await expect(page.locator('.engine-foot')).toHaveText(/^EDoc R\d+\.\d+$/);
  for (const id of ['exportReviewBtn', 'exportRevisionBtn', 'importRevisionBtn', 'printBtn', 'editorBtn', 'publishStatus']) {
    await expect(page.locator('#' + id)).toHaveCount(0);
  }
  const titleBox = await head.locator('.doc-title').boundingBox();
  const width = page.viewportSize().width;
  expect(Math.abs(titleBox.x + titleBox.width / 2 - width / 2)).toBeLessThan(4);
});

test('plain public URL is view-only: no editing area', async ({ page }) => {
  await openDoc(page, { edit: false });
  await expect(page.locator('#editGroup')).toBeHidden();
  await expect(page.locator('#newRevisionBtn')).toBeHidden();
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable', 'false');
  await expect(page.locator('#shareUrlBtn')).toBeEnabled();
});

test('edit link: name comes from the link, token leaves the address bar and is remembered', async ({ page }) => {
  await openDoc(page);
  expect(page.url()).not.toContain(TEST_TOKEN);
  await expect(page.locator('#stateChip')).toHaveText('正式版・唯讀');
  await page.goto(DOC_URL); // same browser, plain URL
  await expect(page.locator('#whoChip')).toHaveText('可編輯・' + TEST_NAME);
  await startRevision(page);
  await expect(page.locator('#stateChip')).toHaveText('修訂中・' + TEST_NAME);
  await expect(page.locator('#revisionMeta')).toContainText('編輯者：' + TEST_NAME);
  await expect(page.locator('#finishRevisionBtn')).toHaveText('完成修訂-版本更新');
  await expect(page.locator('#discardRevisionBtn')).toBeVisible();
  await expect(page.locator('#newRevisionBtn')).toBeHidden();
});

test('revoked edit link: view-only with an explanation, and the token is forgotten', async ({ page }) => {
  const links = testLinks();
  links.links[0].revoked = true;
  const gh = createFakeGithub({ links });
  await enablePublishing(page, { gh });
  await page.goto(DOC_URL + '#edit=' + TEST_TOKEN);
  await expect(page.locator('#notice')).toContainText('編輯連結無效或已停用');
  await expect(page.locator('#editGroup')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('edoc-edit:qa-senior-game-qa-engineer'))).toBeNull();
});

test('publishing appends exactly one version to GitHub, attributed to the link holder', async ({ page }) => {
  const dialogs = await openDoc(page);
  await editAndPublish(page);
  const doc = dialogs.gh.read();
  expect(doc.latestVersion).toBe('v0.8');
  expect(Object.keys(doc.versions)).toEqual([...Object.keys(repoDocument().versions), 'v0.8']);
  expect(doc.versions['v0.7']).toEqual(repoDocument().versions['v0.7']);
  const v8 = doc.versions['v0.8'];
  expect(v8.previous).toBe('v0.7');
  expect(v8.details).toContain('編輯者：' + TEST_NAME);
  expect(v8.hash).toBeUndefined();
  expect(dialogs.gh.commits).toHaveLength(1);
  expect(dialogs.gh.commits[0].message).toBe(`Add v0.8 to qa-senior-game-qa by ${TEST_NAME} via EDoc`);
  // The same hash is shown to everyone: it is computed from the stored html.
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  await expect(page.locator('#publishBadge')).toHaveText('發布中…');
  const d = await renderedDiff(page);
  expect(d.blue).toBe('嚴謹');
});

test('after publishing, the badge turns "已上線" once the public page carries the new version', async ({ page }) => {
  await openDoc(page);
  await page.route((url) => url.searchParams.has('edoc-check'), async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace('"latestVersion":"v0.7"', '"latestVersion":"v0.8"');
    await route.fulfill({ response: res, body: html });
  });
  await editAndPublish(page);
  await expect(page.locator('#publishBadge')).toHaveText('✓ 已上線');
  await expect(page.locator('#publishNote')).toHaveText('公開網址已更新，可以用 LINE 通知對方了。');
});

test('someone published first: conflict is explained, the draft stays and a backup can be downloaded', async ({ page }, testInfo) => {
  const dialogs = await openDoc(page);
  const doc = dialogs.gh.read();
  doc.versions['v0.8'] = { ...doc.versions['v0.7'], previous: 'v0.7', summary: '別人的修改' };
  doc.latestVersion = 'v0.8';
  dialogs.gh.write('documents/qa-senior-game-qa/document.json', doc);

  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
  await page.locator('#finishRevisionBtn').click();
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#dialogTitle')).toHaveText('發布沒有成功');
  await expect(page.locator('#dialogNote')).toContainText('文件已經更新到 v0.8');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#dialogActions button', { hasText: '下載修改備份' }).click()]);
  const pkg = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(pkg.revision.html).toContain('嚴謹');
  await expect(page.locator('#versionLabel')).toHaveText('Draft · Base v0.7');
  expect(dialogs.gh.commits).toHaveLength(0);
});

test('放棄修訂 asks first, then returns to the formal version and forgets the draft', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
  await page.waitForTimeout(700); // autosave
  await page.locator('#discardRevisionBtn').click();
  await expect(page.locator('#dialogTitle')).toHaveText('放棄這次的修改？');
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#versionLabel')).toHaveText('v0.7 · Current');
  await expect(page.locator('#doc')).not.toContainText('嚴謹');
  expect(await page.evaluate(() => localStorage.getItem('edoc-draft:qa-senior-game-qa-engineer'))).toBeNull();
});

test('an unfinished draft is saved in the browser and restored after reopening', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.locator('#versionLabel')).toHaveText('Draft · Base v0.7');
  await expect(page.locator('#notice')).toContainText('已恢復你上次未完成的修訂');
  await expect(page.locator('#doc')).toContainText('並持續嚴謹追蹤');
  await acceptRevision(page, 'v0.8');
  expect((await renderedDiff(page)).blue).toBe('嚴謹');
});

test('a saved draft on an outdated base is not resumed; a backup is offered instead', async ({ page }) => {
  await openDoc(page);
  await page.evaluate(() => localStorage.setItem('edoc-draft:qa-senior-game-qa-engineer',
    JSON.stringify({ baseVersion: 'v0.6', html: '<p>舊的修改</p>', savedAt: new Date().toISOString() })));
  await page.reload();
  await expect(page.locator('#notice')).toContainText('根據 v0.6，但文件已更新到 v0.7');
  await expect(page.locator('#versionLabel')).toHaveText('v0.7 · Current');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#noticeActions button', { hasText: '下載修改備份' }).click()]);
  expect(JSON.parse(await readFile(await dl.path(), 'utf8')).revision.html).toBe('<p>舊的修改</p>');
});

test('a newer published version is announced with a reload button', async ({ page }) => {
  await page.route((url) => url.searchParams.has('edoc-check'), async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace('"latestVersion":"v0.7"', '"latestVersion":"v0.9"') });
  });
  await openDoc(page, { edit: false });
  await expect(page.locator('#notice')).toContainText('已經有更新的版本 v0.9');
  await expect(page.locator('#noticeActions button')).toHaveText('重新整理');
});

test('複製全文 copies the latest wording with its structure, never deleted text', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '進行初步', 'end');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await acceptRevision(page, 'v0.8');
  await expect(page.locator('#doc .deleted')).toHaveText('初步'); // shown as deleted on screen
  await page.locator('#copyBtn').click();
  await expect(page.locator('#copyBtn')).toHaveText('已複製');
  const clip = await page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return { html: await (await item.getType('text/html')).text(), text: await (await item.getType('text/plain')).text() };
  });
  expect(clip.text).toContain('• 利用 Log、Browser DevTools、API Request / Response 等資訊進行問題定位');
  expect(clip.text).not.toContain('初步');
  expect(clip.text).toContain('\n【職務簡述】\n');
  expect(clip.html).toContain('<li>');
  expect(clip.html).not.toContain('初步');
  expect(clip.html).not.toContain('class=');
});

test('下載 PDF points at the official PDF of the version on screen, and is off while revising', async ({ page }) => {
  await openDoc(page);
  const pdf = page.locator('#pdfBtn');
  await expect(pdf).toHaveAttribute('href', 'pdf/v0.7.pdf');
  await expect(pdf).toHaveAttribute('download', '【QA】資深遊戲測試工程師_v0.7.pdf');
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: /^v0\.5/ }).click();
  await expect(pdf).toHaveAttribute('href', 'pdf/v0.5.pdf');
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: /^v0\.7/ }).click();
  await startRevision(page);
  await expect(pdf).toHaveClass(/disabled/);
});

test('複製公開網址 copies the page URL without the edit token', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDoc(page);
  await page.locator('#shareUrlBtn').click();
  await expect(page.locator('#shareUrlBtn')).toHaveText('已複製網址');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain('edit=');
  expect(copied).toMatch(/\/documents\/qa-senior-game-qa\/$/);
});

test('on a phone the open version menu stays on screen and is not covered by header buttons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await openDoc(page);
  await page.locator('#versionButton').click();
  const box = await page.locator('#versionMenu').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  const covered = await page.evaluate(() => {
    const menu = document.getElementById('versionMenu').getBoundingClientRect();
    return [...document.querySelectorAll('.doc-head button, .doc-head .button')].filter((btn) => {
      const b = btn.getBoundingClientRect();
      const x = b.left + b.width / 2, y = b.top + b.height / 2;
      if (x <= menu.left || x >= menu.right || y <= menu.top || y >= menu.bottom) return false;
      const top = document.elementFromPoint(x, y);
      return top === btn || btn.contains(top);
    }).map((btn) => btn.textContent.trim());
  });
  expect(covered).toEqual([]);
});

test('stored version html is filtered before display: injected script never runs', async ({ page }, testInfo) => {
  const doc = JSON.parse(await readFile(join(ROOT, 'documents/qa-senior-game-qa/document.json'), 'utf8'));
  doc.versions['v0.7'].html = doc.versions['v0.7'].html.replace('</h1>',
    '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script><svg onload="window.__pwned=3"></svg></h1>');
  const file = testInfo.outputPath('evil.html');
  await writeFile(file, renderDocument(doc, { templates: await loadTemplates(), script: await bundleRuntime(), slug: 'qa-senior-game-qa' }));
  await page.goto('file://' + file);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('#doc script, #doc svg, #doc [onerror]').count()).toBe(0);
});

test('a local file copy is view-only and cannot copy a public URL', async ({ page }) => {
  await page.goto('file://' + join(ROOT, 'documents/qa-senior-game-qa/index.html') + '#edit=' + TEST_TOKEN);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  await expect(page.locator('#editGroup')).toBeHidden();
  await expect(page.locator('#shareUrlBtn')).toBeDisabled();
});
