// R2.18, after Mac Pages: the 章節 menu, section links (#sec=…) and 以這版內容修訂
// (a draft with a historical version's content, published as a new version).
import { test, expect } from '@playwright/test';
import { openDoc, startRevision, acceptRevision, openVersion, placeCaret, DOC_URL } from './helpers.js';

const SECTIONS = ['職務簡述', '期望特質', '需求條件', '加分項目'];
const headingTop = (page, name) => page.evaluate((n) => {
  const h = [...document.querySelectorAll('#doc h2')].find((x) => x.textContent.includes(n));
  return h.getBoundingClientRect().top - document.querySelector('.doc-head').getBoundingClientRect().bottom;
}, name);

test('章節 lists the sections, marks the one being read and jumps to one', async ({ page }) => {
  await openDoc(page);
  await page.locator('#sectionButton').click();
  const items = page.locator('#sectionMenu .section-go');
  await expect(items).toHaveText(SECTIONS);
  await expect(page.locator('#sectionMenu .section-item.active .section-go')).toHaveText('職務簡述');
  await items.filter({ hasText: '需求條件' }).click();
  await expect(page.locator('#sectionMenu')).not.toHaveClass(/open/);
  await expect.poll(() => headingTop(page, '需求條件')).toBeLessThan(40);
  expect(await headingTop(page, '需求條件')).toBeGreaterThan(0);
  await page.locator('#sectionButton').click();
  await expect(page.locator('#sectionMenu .section-item.active .section-go')).toHaveText('需求條件');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sectionMenu')).not.toHaveClass(/open/);
});

test('a section link opens the page at that section; a missing one says so', async ({ page }) => {
  await page.goto(DOC_URL + '#sec=' + encodeURIComponent('需求條件'));
  await expect(page.locator('#versionLabel')).toHaveText('v0.7 · Current');
  await expect.poll(() => headingTop(page, '需求條件')).toBeLessThan(40);
  await expect(page.locator('.section-arrive')).toHaveCount(1);
  await page.goto(DOC_URL + '#sec=' + encodeURIComponent('不存在的章節'));
  await expect(page.locator('#noticeText')).toHaveText('找不到「不存在的章節」這一節（可能已改名或刪除），顯示的是文件開頭。');
});

test('copying a section link from the menu and from the heading', async ({ page, browserName, context }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openDoc(page);
  await page.locator('#sectionButton').click();
  await page.locator('#sectionMenu .section-item', { hasText: '期望特質' }).locator('.section-link').click();
  await expect(page.locator('#sectionToast')).toHaveText('已複製「期望特質」這一節的連結');
  const base = page.url().split('#')[0];
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(base + '#sec=期望特質');
  // Desktop reading: hovering a heading shows its link button; not while revising.
  await page.locator('#doc h2', { hasText: '加分項目' }).hover();
  await expect(page.locator('.section-hover-link')).toBeVisible();
  await page.locator('.section-hover-link').click();
  await expect(page.locator('#sectionToast')).toHaveText('已複製「加分項目」這一節的連結');
  await startRevision(page);
  await expect(page.locator('.section-hover-link')).toBeHidden();
  await page.locator('#doc h2', { hasText: '職務簡述' }).hover();
  await expect(page.locator('.section-hover-link')).toBeHidden();
  // The menu still works while revising.
  await page.locator('#sectionButton').click();
  await expect(page.locator('#sectionMenu .section-go')).toHaveText(SECTIONS);
});

test('以這版內容修訂: a historical version becomes the next version; history stays as it was', async ({ page }) => {
  const dialogs = await openDoc(page);
  await expect(page.locator('#versionActions')).toBeHidden(); // the latest version
  const before = dialogs.gh.read();
  await openVersion(page, 'v0.5');
  await expect(page.locator('#restoreVersionBtn')).toBeVisible();
  await expect(page.locator('#restoreHint')).toHaveText('開一份草稿，內容換回 v0.5；發布後成為新版本，歷史版本不變');
  await page.locator('#restoreVersionBtn').click();
  await expect(page.locator('#dialogTitle')).toHaveText('以 v0.5 的內容開始修訂？');
  await expect(page.locator('#dialogSummary')).toHaveText('比較基準：目前的 v0.7｜發布後成為 v0.8');
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#versionLabel')).toHaveText('Draft · Base v0.7');
  await expect(page.locator('#revisionRestored')).toHaveText('還原自 v0.5');
  await expect(page.locator('#cardTitle')).toHaveText('v0.7｜版本摘要');
  await expect(page.locator('#revisionSummary')).toHaveText(/^還原 v0\.5：/);
  await acceptRevision(page, 'v0.8');
  const after = dialogs.gh.read();
  const v = after.versions['v0.8'];
  expect(v.summary).toMatch(/^還原 v0\.5：/);
  expect(v.details).toContain('還原自：v0.5');
  for (const k of Object.keys(before.versions)) expect(after.versions[k]).toEqual(before.versions[k]);
  // The new version's words are those of v0.5.
  const clean = (html) => page.evaluate((h) => EDoc.cleanSnapshot(EDoc.sanitizeRevisionHtml(h)).replace(/\s+/g, ''), html);
  const text = (html) => page.evaluate((h) => { const d = document.createElement('div'); d.innerHTML = EDoc.cleanSnapshot(h); return d.textContent.replace(/\s+/g, ''); }, html);
  expect(await text(v.html)).toBe(await text(before.versions['v0.5'].html));
  expect(await clean(v.html)).toBeTruthy();
});

test('restoring replaces an unfinished draft only after asking, and brings the document format back', async ({ page }) => {
  const dialogs = await openDoc(page);
  // v0.8: line spacing 1.5.
  await startRevision(page);
  await page.locator('#formatBar [data-k=layout]').click();
  await page.locator('.fmt-panel.layout [data-k=lineHeight] button', { hasText: /^1\.5$/ }).click();
  await page.locator('.fmt-panel.layout button.primary').click();
  await acceptRevision(page, 'v0.8');
  // An unfinished draft on v0.8.
  await startRevision(page);
  await placeCaret(page, '據此規劃測試範圍。');
  await page.keyboard.insertText('未完成的字');
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: /^v0\.7/ }).click();
  await expect(page.locator('#restoreVersionBtn')).toBeVisible();
  await page.locator('#restoreVersionBtn').click();
  await expect(page.locator('#dialogNote')).toContainText('你有一份還沒完成的修改（基準 v0.8）');
  await expect(page.locator('#dialogActions button')).toHaveText(['取消', '下載修改備份', '取代並開始修訂']);
  await page.locator('#dialogActions button', { hasText: '取消' }).click();
  await expect(page.locator('#versionLabel')).toHaveText(/^v0\.7/);
  await page.locator('#restoreVersionBtn').click();
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#doc')).not.toContainText('未完成的字');
  await expect(page.locator('#revisionSummary')).toHaveText('還原 v0.7：文件格式：行距 1.5→1.7');
  await expect(page.locator('#doc li').first()).toHaveCSS('line-height', /^27\.2/);
  await acceptRevision(page, 'v0.9');
  expect(dialogs.gh.read().versions['v0.9']).not.toHaveProperty('layout');
});

test.describe('phone', () => {
  test.use({ viewport: { width: 440, height: 956 }, hasTouch: true });
  test('the same 章節 menu fits the screen', async ({ page }) => {
    await openDoc(page);
    await page.locator('#sectionButton').click();
    const box = await page.locator('#sectionMenu').boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(440);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.locator('#sectionMenu .section-go', { hasText: '加分項目' }).click();
    await expect.poll(() => headingTop(page, '加分項目')).toBeLessThan(40);
  });
});
