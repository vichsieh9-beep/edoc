// Round trip for the content SSOT: a version created in the browser goes back into
// document.json via ingest, and the rebuilt single-file HTML shows it.
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestReviewHtml } from '../scripts/lib/ingest.mjs';
import { ROOT, bundleRuntime, loadTemplates, renderDocument, renderLibrary } from '../scripts/lib/site.mjs';
import { openDoc, startRevision, acceptRevision, placeCaret, renderedDiff } from './helpers.js';

const DOC_JSON = join(ROOT, 'documents/qa-senior-game-qa/document.json');

async function exportReviewWithNewVersion(page, testInfo) {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '並持續', 'end');
  await page.keyboard.type('嚴謹');
  await acceptRevision(page, 'v0.8');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#exportReviewBtn').click()]);
  const path = testInfo.outputPath('review.html');
  await dl.saveAs(path);
  return readFile(path, 'utf8');
}

test('browser version → ingest → build: rebuilt file shows v0.8 as Current', async ({ page }, testInfo) => {
  const review = await exportReviewWithNewVersion(page, testInfo);
  const source = JSON.parse(await readFile(DOC_JSON, 'utf8'));

  const { doc, added, pendingRevisions } = ingestReviewHtml(source, review);
  expect(added).toEqual(['v0.8']);
  expect(pendingRevisions).toBe(0);
  expect(doc.latestVersion).toBe('v0.8');
  expect(doc.versions['v0.7']).toEqual(source.versions['v0.7']);
  expect(doc.versions['v0.8'].previous).toBe('v0.7');

  const templates = await loadTemplates();
  const built = testInfo.outputPath('index.html');
  await writeFile(built, renderDocument(doc, { templates, script: await bundleRuntime() }));
  expect(renderLibrary([{ slug: 'qa-senior-game-qa', doc }], { templates })).toContain('v0.8 Current');

  await page.goto('file://' + built);
  await expect(page.locator('#versionLabel')).toHaveText('v0.8 · Current');
  await expect(page.locator('#versionHash')).toHaveText('SHA-256：' + doc.versions['v0.8'].hash);
  const d = await renderedDiff(page);
  expect(d.blue).toBe('嚴謹');
  expect(d.red).toBe('');
  expect(await page.title()).toBe('【QA】資深遊戲測試工程師 — EDoc v0.8');
});

test('ingest refuses a file whose formal versions were altered', async ({ page }, testInfo) => {
  const review = await exportReviewWithNewVersion(page, testInfo);
  const source = JSON.parse(await readFile(DOC_JSON, 'utf8'));
  // Someone edits the formal v0.7 inside the exported file's versionData.
  const m = review.match(/(<script\b[^>]*id="versionData"[^>]*>)([\s\S]*?)(<\/script>)/);
  const data = JSON.parse(m[2]);
  data['v0.7'].html = data['v0.7'].html.replace('深入理解遊戲規則', '深入理解遊戲規格');
  const tampered = review.replace(m[0], () => m[1] + JSON.stringify(data).replace(/<\//g, '<\\/') + m[3]);
  expect(tampered).not.toBe(review);
  expect(() => ingestReviewHtml(source, tampered)).toThrow(/正式版本 v0\.7 的 html .*拒絕匯入/);
  expect(() => ingestReviewHtml({ ...source, documentId: 'other-doc' }, review)).toThrow(/documentId 不符/);
});
