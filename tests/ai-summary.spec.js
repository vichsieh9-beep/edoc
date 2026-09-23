// Phase 4 display (U1): a version with an AI summary leads with the AI one-liner,
// keeps the engine statistics, and lists the AI changelog first. Anything else looks as before.
import { test, expect } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestReviewHtml } from '../scripts/lib/ingest.mjs';
import { applyAiSummary } from '../scripts/lib/changelog.mjs';
import { ROOT, bundleRuntime, loadTemplates, renderDocument } from '../scripts/lib/site.mjs';
import { openDoc, startRevision, acceptRevision, placeCaret, openVersion } from './helpers.js';

const AI = {
  summary: '補強問題重現與回歸確認責任。',
  details: ['職務簡述：追蹤問題的責任延伸到協助重現與回歸確認。'],
  model: 'claude-test',
};

// v0.8 made in the browser, ingested into a copy of document.json, then given an AI summary.
async function documentWithV08(page, testInfo) {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '並持續追蹤問題直到驗證完成', 'end');
  await page.keyboard.type('，必要時協助重現與回歸確認');
  await acceptRevision(page, 'v0.8');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#exportReviewBtn').click()]);
  const reviewPath = testInfo.outputPath('review.html');
  await dl.saveAs(reviewPath);
  const source = JSON.parse(await readFile(join(ROOT, 'documents/qa-senior-game-qa/document.json'), 'utf8'));
  return ingestReviewHtml(source, await readFile(reviewPath, 'utf8')).doc;
}

async function openBuilt(page, testInfo, doc, name) {
  const file = testInfo.outputPath(name);
  await writeFile(file, renderDocument(doc, { templates: await loadTemplates(), script: await bundleRuntime() }));
  await page.goto('file://' + file);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
}

test('version with an AI summary: AI one-liner first, statistics kept, AI changelog first in details', async ({ page }, testInfo) => {
  const base = await documentWithV08(page, testInfo);
  const doc = applyAiSummary(base, 'v0.8', AI, { hash: base.versions['v0.8'].hash, now: new Date('2026-09-23T07:30:00Z') });
  await openBuilt(page, testInfo, doc, 'with-ai.html');

  await expect(page.locator('#cardSummary .ai-chip')).toHaveText('AI');
  await expect(page.locator('#cardSummary')).toContainText(AI.summary);
  await expect(page.locator('#cardSummary .ai-stat')).toHaveText('變更統計：' + base.versions['v0.8'].summary);

  const items = await page.locator('#detailList > li').allTextContents();
  expect(items[0]).toMatch(/^AI 語意 Changelogclaude-test · 2026-09-2\d · 內容雜湊相符$/);
  expect(items[1]).toBe(AI.details[0]);
  expect(items[2]).toBe('系統統計');
  expect(items).toContain('職務簡述 1 處修改');
  expect(items.some((t) => t.startsWith('語意摘要：'))).toBe(false);

  await page.locator('#versionButton').click();
  const first = page.locator('#versionMenu .version-item').first();
  await expect(first.locator('.ai-chip')).toHaveText('AI');
  await expect(first.locator('.version-summary')).toContainText(AI.summary);
  await page.locator('#versionButton').click(); // close the menu

  // Versions without an AI summary look exactly as before.
  await openVersion(page, 'v0.7');
  await expect(page.locator('#cardSummary .ai-chip')).toHaveCount(0);
  await expect(page.locator('#cardSummary')).toHaveText(doc.versions['v0.7'].summary);
  await expect(page.locator('#detailList .ai-sec')).toHaveCount(0);
});

test('an AI summary bound to other content is not shown', async ({ page }, testInfo) => {
  const base = await documentWithV08(page, testInfo);
  const doc = applyAiSummary(base, 'v0.8', AI, { hash: base.versions['v0.8'].hash });
  doc.versions['v0.8'].aiSummary.contentHash = 'f'.repeat(64);
  await openBuilt(page, testInfo, doc, 'wrong-hash.html');

  await expect(page.locator('#cardSummary .ai-chip')).toHaveCount(0);
  await expect(page.locator('#cardSummary')).toHaveText(base.versions['v0.8'].summary);
  await expect(page.locator('#detailList')).toContainText('語意摘要：待回到 ChatGPT 後依完整 Diff 自動補充');
});
