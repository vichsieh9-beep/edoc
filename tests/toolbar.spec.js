// R2.16 formatting toolbar: what each command stores, how it is marked, undo, paste and links.
import { test, expect } from '@playwright/test';
import { openDoc, startRevision, selectText, placeCaret, acceptRevision } from './helpers.js';

const formats = (page) => page.evaluate(() => [...(CSS.highlights?.get('edoc-formats') || [])].map((r) => r.toString()).join(''));
const clean = (page) => page.evaluate(() => EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML));
const stored = (gh, v) => gh.read().versions[v].html;
const tool = (page, key) => page.locator(`#formatBar [data-k="${key}"]`);

test('the toolbar appears only while revising', async ({ page }) => {
  await openDoc(page);
  await expect(page.locator('#formatBar')).toBeHidden();
  await startRevision(page);
  await expect(page.locator('#formatBar')).toBeVisible();
  await page.locator('#discardRevisionBtn').click();
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#formatBar')).toBeHidden();
});

test('bolding two characters publishes a format change of exactly those characters', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, '產品的品質');
  await tool(page, 'bold').click();
  await expect(tool(page, 'bold')).toHaveClass(/\bon\b/);
  await expect.poll(() => formats(page)).toBe('產品的品質');
  await expect(page.locator('#revisionSummary')).toHaveText('職務簡述 1 處格式變更');
  await expect(page.locator('#revisionMarkup .markup-card .markup-kind')).toHaveText(['格式變更']);
  await expect(page.locator('#revisionMarkup .markup-card')).toContainText('粗體：產品的品質');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toMatch(/<b><span class="format-changed" data-edoc-fmt="\+b">產品的品質<\/span><\/b>/);
  expect(html).not.toContain('class="changed"');
  await expect(page.locator('#cardSummary')).toHaveText('統計：0 處修改、0 處新增、0 處刪除、1 處格式變更。');
  await expect(page.locator('#doc span.format-changed')).toHaveCSS('text-decoration-style', 'dotted');
  // The next draft starts white: the earlier format change is not shown again.
  await startRevision(page);
  await expect(page.locator('#revisionMarkup')).toContainText('沒有內容變更');
  expect(await clean(page)).toContain('<b><span>產品的品質</span></b>');
});

test('colour, highlight, font and size are stored in their canonical form', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, '深入理解');
  await tool(page, 'color').click();
  await page.locator('.fmt-pop .fmt-swatch[title="紅"]').first().click();
  await selectText(page, '深入理解');
  await tool(page, 'mark').click();
  await page.locator('.fmt-pop .fmt-swatch[title="黃"]').click();
  await selectText(page, '深入理解');
  await tool(page, 'font').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: '思源宋體' }).click();
  await selectText(page, '深入理解');
  await tool(page, 'size').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: /^16/ }).click();
  await expect(tool(page, 'size').locator('.fmt-label')).toHaveText('16');
  await expect(tool(page, 'font').locator('.fmt-label')).toHaveText('思源宋體');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toContain('background-color:#ffff00');
  expect(html).toContain('color:#ff0000');
  expect(html).toContain("font-family:'Noto Serif TC',serif");
  expect(html).toContain('font-size:16pt');
  expect(html).not.toMatch(/<font|rgb\(|px/);
  await expect(page.locator('#doc li', { hasText: '深入理解' }).locator('span[style*="color"]').first()).toHaveCSS('color', 'rgb(255, 0, 0)');
});

test('paragraph style, alignment and list changes mark the block, not delete plus add', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '職務簡述');
  await tool(page, 'style').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: '標題 3' }).click();
  await placeCaret(page, '執行功能測試');
  await tool(page, 'center').click();
  await placeCaret(page, '利用 Log', 'start');
  await page.keyboard.press('Tab');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toMatch(/<h3 class="format-changed" data-edoc-fmt="style">【職務簡述】<\/h3>/);
  expect(html).toMatch(/<li class="format-changed" data-edoc-fmt="align" style="text-align:center">執行功能測試/);
  expect(html).toMatch(/<li class="format-changed" data-edoc-fmt="indent">利用 Log/);
  expect(html).not.toContain('class="deleted"');
  expect(html).not.toContain('class="changed"');
});

test('undo and redo through the toolbar, also next to deletion fragments', async ({ page, browserName }) => {
  await openDoc(page);
  await startRevision(page);
  const before = await clean(page);
  await selectText(page, '初步');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
  await selectText(page, '產品的品質');
  await tool(page, 'bold').click();
  await expect.poll(() => formats(page)).toBe('產品的品質');
  await tool(page, 'undo').click();
  await expect.poll(() => formats(page)).toBe('');
  // WebKit's own undo history groups a text edit with the formatting that follows it, so one
  // undo may revert both; while the deletion is still there its fragment must be shown.
  if (browserName !== 'webkit' || !(await page.locator('#revisionMarkup').textContent()).includes('沒有內容變更')) {
    await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
    await tool(page, 'undo').click();
  }
  await expect.poll(() => clean(page)).toBe(before);
  await expect(page.locator('#revisionMarkup')).toContainText('沒有內容變更');
  await tool(page, 'redo').click();
  await expect(page.locator('#doc .draft-deletion')).toHaveText('初步');
});

test('keyboard: underline round trip, strikethrough, lists and Tab', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, '獨立設計');
  await page.keyboard.press('ControlOrMeta+u');
  await selectText(page, '回歸測試');
  await page.keyboard.press('ControlOrMeta+Shift+x');
  await expect(page.locator('#revisionSummary')).toHaveText('職務簡述 2 處格式變更');
  await acceptRevision(page, 'v0.8');
  expect(stored(dialogs.gh, 'v0.8')).toMatch(/<u><span class="format-changed" data-edoc-fmt="\+u">獨立設計<\/span><\/u>/);
  expect(stored(dialogs.gh, 'v0.8')).toMatch(/<s><span class="format-changed" data-edoc-fmt="\+s">回歸測試<\/span><\/s>/);
  // Shown as underlined; a later text edit does not bring the old change back.
  await expect(page.locator('#doc u')).toHaveText('獨立設計');
  await startRevision(page);
  await selectText(page, '初步');
  await page.keyboard.insertText('快速');
  await acceptRevision(page, 'v0.9');
  const next = stored(dialogs.gh, 'v0.9');
  expect(next).not.toContain('format-changed');
  expect(next).toContain('<u><span>獨立設計</span></u>');
});

test('pasted rich text keeps supported formatting only', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '據此規劃測試範圍。');
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<meta charset="utf-8"><span style="color:#ff0000;font-weight:700;font-family:Arial;font-size:11pt;text-decoration:underline">紅色粗體</span><span style="color:rgb(17,17,17)">一般字</span>');
    data.setData('text/plain', '紅色粗體一般字');
    document.querySelector('#doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#revisionMarkup')).toContainText('紅色粗體一般字');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toContain('紅色粗體');
  expect(html).toMatch(/color:#ff0000;font-family:Arimo/);
  expect(html).toMatch(/<strong>|<b>/);
  expect(html).toContain('<u>');
  expect(html).not.toMatch(/11pt|rgb\(|font-weight/);
});

test('a link is added with the link button and Ctrl/Cmd+K', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, 'API Request');
  await page.keyboard.press('ControlOrMeta+k');
  await page.locator('.fmt-pop input').fill('developer.chrome.com/docs/devtools');
  await page.locator('.fmt-pop button.primary').click();
  await expect(page.locator('#doc a')).toHaveAttribute('href', 'https://developer.chrome.com/docs/devtools');
  await expect(page.locator('#revisionMarkup .markup-card')).toContainText('連結：API Request');
  await acceptRevision(page, 'v0.8');
  expect(stored(dialogs.gh, 'v0.8')).toContain('<a href="https://developer.chrome.com/docs/devtools">');
});

test.describe('phone', () => {
 test.use({ viewport: { width: 440, height: 956 }, hasTouch: true });
 test('the toolbar sits at the bottom and Aa opens the text format sheet', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  const bar = await page.locator('#formatBar').boundingBox();
  expect(bar.y + bar.height).toBeGreaterThan(956 - 2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await selectText(page, '深入理解');
  await tool(page, 'aa').click();
  await expect(page.locator('.fmt-sheet')).toBeVisible();
  await page.locator('.fmt-sheet .fmt-chip', { hasText: /^20$/ }).click();
  await expect(page.locator('#revisionSummary')).toHaveText('職務簡述 1 處格式變更');
  await page.locator('.fmt-sheet button', { hasText: '完成' }).click();
  await expect(page.locator('.fmt-sheet')).toHaveCount(0);
 });
});
