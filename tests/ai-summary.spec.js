// Phase 4 display (U1): a version with an AI summary leads with the AI one-liner,
// keeps the engine statistics, and lists the AI changelog first. Anything else looks as before.
import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { applyAiSummary } from '../scripts/lib/changelog.mjs';
import { bundleRuntime, loadTemplates, renderDocument } from '../scripts/lib/site.mjs';
import { openDoc, startRevision, acceptRevision, placeCaret, openVersion } from './helpers.js';

const AI = {
  summary: '補強問題重現與回歸確認責任。',
  details: ['職務簡述：追蹤問題的責任延伸到協助重現與回歸確認。'],
  model: 'claude-test',
};

// v0.8 published from the page (through the Worker, into a fake GitHub), with its content hash.
async function documentWithV08(page) {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '並持續追蹤問題直到驗證完成', 'end');
  await page.keyboard.type('，必要時協助重現與回歸確認');
  await acceptRevision(page, 'v0.8');
  const doc = dialogs.gh.read();
  doc.versions['v0.8'].hash = await page.evaluate(() => EDoc.ensureHash('v0.8'));
  return doc;
}

async function openBuilt(page, testInfo, doc, name) {
  const file = testInfo.outputPath(name);
  await writeFile(file, renderDocument(doc, { templates: await loadTemplates(), script: await bundleRuntime(), slug: 'qa-senior-game-qa' }));
  await page.goto('file://' + file);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
}

test('version with an AI summary: AI one-liner first, statistics kept, AI changelog first in details', async ({ page }, testInfo) => {
  const base = await documentWithV08(page);
  const doc = applyAiSummary(base, 'v0.8', AI, { hash: base.versions['v0.8'].hash, now: new Date('2026-09-23T07:30:00Z') });
  await openBuilt(page, testInfo, doc, 'with-ai.html');

  await expect(page.locator('#cardSummary')).toHaveText('統計：1 處修改、0 處新增、0 處刪除。');
  await expect(page.locator('#cardMeaning')).toHaveText(AI.summary);
  for(const id of ['compareBadge','statusBadge','versionHash','changeDetails']) await expect(page.locator('#'+id)).toBeHidden();
  await expect(page.locator('#revisionMarkup')).not.toContainText('比較基準');

  await page.locator('#versionButton').click();
  const first = page.locator('#versionMenu .version-item').first();
  await expect(first.locator('.ai-chip')).toHaveText('AI');
  await expect(first.locator('.version-summary')).toContainText(AI.summary);
  await page.locator('#versionButton').click(); // close the menu

  await openVersion(page, 'v0.7');
  await expect(page.locator('#cardMeaning')).toHaveText('變更說明尚未補寫');
});

test('an AI summary bound to other content is not shown', async ({ page }, testInfo) => {
  const base = await documentWithV08(page);
  const doc = applyAiSummary(base, 'v0.8', AI, { hash: base.versions['v0.8'].hash });
  doc.versions['v0.8'].aiSummary.contentHash = 'f'.repeat(64);
  await openBuilt(page, testInfo, doc, 'wrong-hash.html');

  await expect(page.locator('#cardSummary .ai-chip')).toHaveCount(0);
  await expect(page.locator('#cardSummary')).toHaveText('統計：1 處修改、0 處新增、0 處刪除。');
  await expect(page.locator('#cardMeaning')).toHaveText('變更說明尚未補寫');
  await expect(page.locator('#detailList .pending-summary')).toHaveText('變更說明尚未補寫');
  await expect(page.locator('#detailList')).not.toContainText('待回到 ChatGPT');
});
