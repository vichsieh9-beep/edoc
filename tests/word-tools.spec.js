// R2.17 Word tools, second phase: the full size list, superscript and subscript, page breaks,
// tables, find & replace, the format painter and the document format settings.
import { test, expect } from '@playwright/test';
import { openDoc, startRevision, selectText, placeCaret, acceptRevision } from './helpers.js';

const clean = (page) => page.evaluate(() => EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML));
const stored = (gh, v) => gh.read().versions[v].html;
const tool = (page, key) => page.locator(`#formatBar [data-k="${key}"]`);
const tableTool = (page, key) => page.locator(`.fmt-table-bar [data-k="${key}"]`);
/** Text of every cell, row by row. */
const cells = (page) => page.evaluate(() => [...document.querySelectorAll('#doc table tr')]
  .filter((tr) => !tr.closest('.deletion-record'))
  .map((tr) => [...tr.children].filter((c) => !c.matches('.deletion-record')).map((c) => c.textContent)));

test('sizes outside the browser\'s seven are stored in pt; superscript and subscript buttons', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, '深入理解');
  await tool(page, 'size').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: /^22$/ }).click();
  await expect(tool(page, 'size').locator('.fmt-label')).toHaveText('22');
  await selectText(page, '據此規劃');
  await tool(page, 'size').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: /^14$/ }).click();
  await selectText(page, 'API Request');
  await tool(page, 'sup').click();
  await expect(tool(page, 'sup')).toHaveClass(/\bon\b/);
  await selectText(page, '回歸測試');
  await page.keyboard.press('ControlOrMeta+=');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toContain('font-size:22pt');
  expect(html).toContain('font-size:14pt');
  expect(html).toMatch(/<sup><span class="format-changed" data-edoc-fmt="\+sup">API Request<\/span><\/sup>/);
  expect(html).toMatch(/<sub><span class="format-changed" data-edoc-fmt="\+sub">回歸測試<\/span><\/sub>/);
  expect(html).not.toMatch(/<font|px/);
});

test('a page break goes between paragraphs, is counted and starts a new page', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '職務簡述');
  await tool(page, 'insert').click();
  await page.locator('.fmt-pop .fmt-opt', { hasText: '分頁符號' }).click();
  await expect(page.locator('#doc hr[data-edoc-break="page"]')).toHaveCount(1);
  await expect(page.locator('#revisionSummary')).toContainText('1 處新增');
  await acceptRevision(page, 'v0.8');
  // After the heading, before the list of that section.
  expect(stored(dialogs.gh, 'v0.8')).toMatch(/【職務簡述】<\/h2>\s*<hr (class="changed" data-edoc-break="page"|data-edoc-break="page" class="changed")>\s*<ul>/);
  await expect(page.locator('#doc hr[data-edoc-break]')).toHaveCSS('border-top-style', 'dashed');
});

test('insert a table, type with Tab between cells, add and delete rows and columns', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '據此規劃測試範圍。');
  await tool(page, 'insert').click();
  await page.locator('.fmt-pop .fmt-grid-sq[data-r="2"][data-c="3"]').hover();
  await expect(page.locator('.fmt-pop .fmt-grid-size')).toHaveText('2 列 × 3 欄');
  await page.locator('.fmt-pop .fmt-grid-sq[data-r="2"][data-c="3"]').click();
  await expect(page.locator('#doc table')).toHaveCount(1);
  expect(await cells(page)).toEqual([['', '', ''], ['', '', '']]);
  await expect(page.locator('#doc table th')).toHaveCount(3);
  await expect(page.locator('.fmt-table-bar')).toBeVisible();
  await page.keyboard.insertText('項目');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('說明');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('備註');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('甲');
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['甲', '', '']]);
  // Tab in the last cell adds a row.
  await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['甲', '', ''], ['', '', '']]);
  await page.keyboard.insertText('乙');
  await tableTool(page, 'col-right').click();
  expect(await cells(page)).toEqual([['項目', '', '說明', '備註'], ['甲', '', '', ''], ['乙', '', '', '']]);
  await expect(page.locator('#doc table tr').first().locator('th')).toHaveCount(4);
  await page.keyboard.insertText('丙');
  expect((await cells(page))[2]).toEqual(['乙', '丙', '', '']);
  await tableTool(page, 'col-delete').click();
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['甲', '', ''], ['乙', '', '']]);
  await placeCaret(page, '甲');
  await tableTool(page, 'row-delete').click();
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['乙', '', '']]);
  await tableTool(page, 'row-above').click();
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['', '', ''], ['乙', '', '']]);
  await tableTool(page, 'row-delete').click();
  await placeCaret(page, '備註');
  await tableTool(page, 'col-left').click();
  await tableTool(page, 'col-delete').click();
  expect(await cells(page)).toEqual([['項目', '說明', '備註'], ['乙', '', '']]);
  // The table went after the list item's list, before the divider; nothing else moved.
  expect(await page.evaluate(() => [...document.querySelector('#doc').children].slice(2, 5).map((n) => n.tagName))).toEqual(['UL', 'TABLE', 'HR']);
  await expect(page.locator('#doc .draft-deletion')).toHaveCount(0);
  await expect(page.locator('#revisionSummary')).toContainText('新增');
  await acceptRevision(page, 'v0.8');
  const html = stored(dialogs.gh, 'v0.8');
  expect(html).toMatch(/<table[^>]*><tbody><tr><th class="changed">項目<\/th><th class="changed">說明<\/th><th class="changed">備註<\/th><\/tr><tr><td class="changed">乙<\/td><td class="changed"><\/td><td class="changed"><\/td><\/tr><\/tbody><\/table>/);
  // Borders and the header row, on screen as in the PDF.
  await expect(page.locator('#doc th').first()).toHaveCSS('background-color', 'rgb(242, 242, 242)');
  await expect(page.locator('#doc td').first()).toHaveCSS('border-top-style', 'solid');
});

test('the table bar deletes the table; merged cells grow and shrink with rows and columns', async ({ page }) => {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '據此規劃測試範圍。');
  await page.evaluate(() => {
    // An imported table with merged cells, pasted as html.
    const data = new DataTransfer();
    data.setData('text/html', '<table><tbody><tr><td colspan="2">合併</td><td>丙</td></tr><tr><td rowspan="2">跨列</td><td>甲</td><td>乙</td></tr><tr><td>丁</td><td>戊</td></tr></tbody></table>');
    document.querySelector('#doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#doc table')).toHaveCount(1);
  await placeCaret(page, '甲');
  await tableTool(page, 'row-below').click();
  await expect(page.locator('#doc td', { hasText: '跨列' })).toHaveAttribute('rowspan', '3');
  await placeCaret(page, '合併');
  await tableTool(page, 'col-delete').click();
  await expect(page.locator('#doc td', { hasText: '合併' })).not.toHaveAttribute('colspan', /./);
  // Column 1 held 跨列 alone: it goes with the column; 合併 now covers one column.
  expect(await cells(page)).toEqual([['合併', '丙'], ['甲', '乙'], ['', ''], ['丁', '戊']]);
  await tableTool(page, 'table-delete').click();
  await expect(page.locator('#doc table')).toHaveCount(0);
  await expect(page.locator('.fmt-table-bar')).toBeHidden();
});

test('one undo puts the previous table back', async ({ page, browserName }) => {
  await openDoc(page);
  await startRevision(page);
  await placeCaret(page, '據此規劃測試範圍。');
  await tool(page, 'insert').click();
  await page.locator('.fmt-pop .fmt-grid-sq[data-r="2"][data-c="2"]').click();
  await page.keyboard.insertText('一');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('二');
  await tableTool(page, 'col-right').click();
  await page.keyboard.insertText('三');
  const full = [['一', '二', '三'], ['', '', '']];
  expect(await cells(page)).toEqual(full);
  await tool(page, 'undo').click();
  if (browserName === 'webkit') {
    // WebKit's own undo history merges script edits with the typing that follows them, so one
    // undo can go back further; it always lands on an earlier whole state, and redo returns.
    expect([[['一', '二', ''], ['', '', '']], [['一', '二'], ['', '']], [['一', ''], ['', '']], [['', ''], ['', '']], []]).toContainEqual(await cells(page));
    while (JSON.stringify(await cells(page)) !== JSON.stringify(full)) await tool(page, 'redo').click();
  } else {
    expect(await cells(page)).toEqual([['一', '二', ''], ['', '', '']]);
    await tool(page, 'undo').click();
    expect(await cells(page)).toEqual([['一', '二'], ['', '']]);
    await tool(page, 'redo').click(); await tool(page, 'redo').click();
  }
  expect(await cells(page)).toEqual(full);
  await expect(page.locator('#doc .deletion-record')).toHaveCount(0);
});

test('文件格式: one setting for the whole document, published with the version and in its hash', async ({ page }) => {
  const dialogs = await openDoc(page);
  const oldHash = await page.locator('#versionHash').textContent();
  await startRevision(page);
  await tool(page, 'layout').click();
  const panel = page.locator('.fmt-panel.layout');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-k=lineHeight] button.on')).toHaveText('1.7');
  await panel.locator('select[data-k=font]').selectOption('serif');
  await panel.locator('[data-k=lineHeight] button', { hasText: /^1\.5$/ }).click();
  await panel.locator('[data-k=indent] button', { hasText: '2 字' }).click();
  await panel.locator('button.primary', { hasText: '套用' }).click();
  await expect(panel).toHaveCount(0);
  const p = page.locator('#doc > p').first();
  const li = page.locator('#doc li').first();
  await expect(li).toHaveCSS('line-height', '24px'); // 12pt × 1.5
  await expect(li).toHaveCSS('font-family', /Noto Serif TC/);
  await expect(li).toHaveCSS('text-indent', '0px');
  if (await p.count()) await expect(p).toHaveCSS('text-indent', '32px');
  await expect(page.locator('#revisionSummary')).toHaveText('文件格式：預設字型 思源黑體→思源宋體、行距 1.7→1.5、首行縮排 無→2 字');
  // The format alone is a change worth a version; the draft keeps it after a reload.
  await page.reload();
  await expect(page.locator('#versionLabel')).toHaveText(/^Draft · Base v0\.7$/);
  await expect(li).toHaveCSS('line-height', '24px');
  await acceptRevision(page, 'v0.8');
  const v = dialogs.gh.read().versions['v0.8'];
  expect(v.layout).toEqual({ font: 'serif', lineHeight: '1.5', indent: '2' });
  expect(v.summary).toBe('文件格式：預設字型 思源黑體→思源宋體、行距 1.7→1.5、首行縮排 無→2 字');
  expect(v.details).toContain('文件格式：預設字型 思源黑體→思源宋體、行距 1.7→1.5、首行縮排 無→2 字');
  await expect(page.locator('#cardSummary')).toHaveText('統計：0 處修改、0 處新增、0 處刪除、文件格式變更。');
  await expect(li).toHaveCSS('font-family', /Noto Serif TC/);
  // Same words, different format: a different SHA-256. The old version keeps its own.
  const hash = await page.locator('#versionHash').textContent();
  expect(hash).not.toBe(oldHash);
  expect(hash).toBe('SHA-256：' + await page.evaluate(() => EDoc.sha256(EDoc.cleanSnapshot(EDoc.versions['v0.8'].html) + '\n<edoc-layout font=serif;lineHeight=1.5;indent=2>')));
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: /^v0\.7/ }).click();
  await expect(page.locator('#versionHash')).toHaveText(oldHash);
  await expect(li).toHaveCSS('line-height', /^27\.2/); // the default 1.7 × 16px
  // The next draft starts from the published format; back to the defaults is a change too.
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: /^v0\.8/ }).click();
  await startRevision(page);
  await tool(page, 'layout').click();
  await expect(panel.locator('[data-k=lineHeight] button.on')).toHaveText('1.5');
  await panel.locator('[data-k=lineHeight] button', { hasText: /^1\.7$/ }).click();
  await panel.locator('button', { hasText: '取消' }).click();
  await expect(li).toHaveCSS('line-height', '24px');
});

test('the PDF and Word copies use the version\'s document format', async () => {
  const { pdfHtml } = await import('../scripts/lib/pdf.mjs');
  const html = pdfHtml({ version: 'v1', html: '<p>內文</p>', hash: 'a'.repeat(64), url: 'https://x/', layout: { lineHeight: '2.0', spacing: 'compact', indent: '2', size: '14' } });
  expect(html).toContain('body{font-size:14pt}');
  expect(html).toContain('body :is(p,li,td,th,blockquote){line-height:2}');
  expect(html).toContain('body>p,body blockquote>p{text-indent:2em}');
  expect(pdfHtml({ version: 'v1', html: '<p>內文</p>', hash: 'a'.repeat(64), url: 'https://x/' })).not.toContain('text-indent');
});

const highlights = (page, name) => page.evaluate((n) => [...(CSS.highlights?.get(n) || [])].map((r) => r.toString()), name);
test('find & replace: every match listed with its section, jump, replace one and all', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await page.locator('#doc').focus();
  await page.keyboard.press('ControlOrMeta+Shift+h');
  const panel = page.locator('.fmt-panel.find');
  await expect(panel).toBeVisible();
  await expect(panel.locator('#findText')).toBeFocused();
  await panel.locator('#findText').fill('測試');
  const count = await panel.locator('.find-row').count();
  expect(count).toBeGreaterThan(5);
  await expect(panel.locator('.find-count')).toHaveText(`第 1 筆／共 ${count} 筆`);
  await expect(panel.locator('.find-row').first().locator('.find-sec')).toHaveText('標題');
  await expect(panel.locator('.find-row').nth(1).locator('.find-sec')).toHaveText('職務簡述');
  await expect(panel.locator('.find-row').nth(1).locator('mark')).toHaveText('測試');
  expect(await highlights(page, 'edoc-find-current')).toEqual(['測試']);
  expect((await highlights(page, 'edoc-find')).length).toBe(count - 1);
  // A row of the overview jumps there; next and previous follow.
  await panel.locator('.find-row').nth(3).click();
  await expect(panel.locator('.find-row.on .find-num')).toHaveText('4');
  await panel.locator('[data-k=next]').click();
  await expect(panel.locator('.find-count')).toHaveText(`第 5 筆／共 ${count} 筆`);
  await panel.locator('[data-k=prev]').click();
  await panel.locator('[data-k=prev]').click();
  await expect(panel.locator('.find-count')).toHaveText(`第 3 筆／共 ${count} 筆`);
  const ctx = await panel.locator('.find-row.on .find-ctx').textContent();
  await panel.locator('#replaceText').fill('驗證');
  await panel.locator('[data-k=one]').click();
  await expect(panel.locator('.find-count')).toHaveText(`第 3 筆／共 ${count - 1} 筆`);
  await expect(page.locator('#revisionSummary')).toContainText('1 處修改');
  const text = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = EDoc.cleanSnapshot(document.querySelector('#doc').innerHTML); return d.textContent; });
  expect(text).toContain(ctx.replace(/…/g, '').replace('測試', '驗證').slice(0, 10));
  await panel.locator('[data-k=all]').click();
  await expect(panel.locator('.find-count')).toHaveText(`已取代 ${count - 1} 筆`);
  await expect(panel.locator('.find-row')).toHaveCount(0);
  // Deleted words shown in red are not matched again.
  await panel.locator('#findText').fill('測試');
  await expect(panel.locator('.find-count')).toHaveText('找不到');
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  expect(await highlights(page, 'edoc-find')).toEqual([]);
  await acceptRevision(page, 'v0.8');
  const html = dialogs.gh.read().versions['v0.8'].html;
  expect(html.replace(/<span class="deleted">測試<\/span>/g, '')).not.toContain('測試');
  expect(html).toContain('<span class="changed">驗證</span>');
});

// Select `word` and lift the mouse, as when painting with the mouse; returns the word's colour then.
async function paintOver(page, word) {
  await selectText(page, word);
  await page.locator('#doc').dispatchEvent('mouseup');
  await page.waitForTimeout(50);
  return page.evaluate((w) => {
    const t = document.createTreeWalker(document.querySelector('#doc'), NodeFilter.SHOW_TEXT);
    let n; while ((n = t.nextNode())) if (n.data.includes(w) && !n.parentElement.closest('.draft-deletion')) return getComputedStyle(n.parentElement).color;
  }, word);
}
test('format painter: copies text formatting once, or until Esc after a double click', async ({ page }) => {
  const dialogs = await openDoc(page);
  await startRevision(page);
  await selectText(page, '深入理解');
  await tool(page, 'bold').click();
  await tool(page, 'color').click();
  await page.locator('.fmt-pop .fmt-swatch[title="紅"]').first().click();
  await placeCaret(page, '深入理解', 'start');
  await page.keyboard.press('ArrowRight');
  await tool(page, 'painter').click();
  await expect(tool(page, 'painter')).toHaveClass(/\bon\b/);
  await expect(page.locator('#doc')).toHaveClass(/painting/);
  expect(await paintOver(page, '回歸測試')).toBe('rgb(255, 0, 0)');
  await expect(tool(page, 'painter')).not.toHaveClass(/\bon\b/);
  await expect(page.locator('#doc')).not.toHaveClass(/painting/);
  // Painting again needs the painter again.
  expect(await paintOver(page, '獨立設計')).not.toBe('rgb(255, 0, 0)');
  // Double click: keeps painting until Esc.
  await placeCaret(page, '深入理解', 'end');
  await page.keyboard.press('ArrowLeft');
  await tool(page, 'painter').dblclick();
  await expect(tool(page, 'painter')).toHaveClass(/sticky/);
  expect(await paintOver(page, '產品規格')).toBe('rgb(255, 0, 0)');
  expect(await paintOver(page, '跨裝置')).toBe('rgb(255, 0, 0)');
  await expect(tool(page, 'painter')).toHaveClass(/\bon\b/);
  await page.keyboard.press('Escape');
  await expect(tool(page, 'painter')).not.toHaveClass(/\bon\b/);
  await acceptRevision(page, 'v0.8');
  const html = dialogs.gh.read().versions['v0.8'].html;
  // Colour given to text that is already bold is kept too (the browser puts it on the <b>).
  expect(html).toMatch(/<b><span style="color:#ff0000"><span class="format-changed" data-edoc-fmt="\+b color">深入理解<\/span><\/span><\/b>/);
  for (const w of ['回歸測試', '產品規格', '跨裝置']) expect(html, w).toContain(`<span style="color:#ff0000"><b><span class="format-changed" data-edoc-fmt="+b color">${w}</span></b></span>`);
  expect(html).not.toMatch(/style="color:#ff0000"[^>]*>獨立設計/);
});

test.describe('phone', () => {
  test.use({ viewport: { width: 440, height: 956 }, hasTouch: true });
  test('⋯ holds the new tools; find and document format rise from the bottom', async ({ page }) => {
    await openDoc(page);
    await startRevision(page);
    for (const k of ['sup', 'sub', 'painter', 'find', 'layout', 'insert']) await expect(tool(page, k)).toBeHidden();
    await placeCaret(page, '據此規劃測試範圍。');
    await tool(page, 'more').click();
    const sheet = page.locator('.fmt-sheet');
    await expect(sheet).toContainText('上標');
    await sheet.locator('.fmt-grid-sq[data-r="2"][data-c="2"]').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('#doc table')).toHaveCount(1);
    await expect(page.locator('.fmt-table-bar')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await tool(page, 'more').click();
    await sheet.locator('.fmt-chip', { hasText: '尋找與取代' }).click();
    const find = page.locator('.fmt-panel.find');
    await expect(find).toBeVisible();
    const box = await find.boundingBox();
    expect(box.y + box.height).toBeGreaterThan(956 - 2);
    expect(box.height).toBeLessThanOrEqual(956 * 0.62 + 1);
    await page.locator('#findText').fill('測試');
    await expect(find.locator('.find-row').first()).toBeVisible();
    await find.locator('.fmt-panel-close').click();
    await tool(page, 'more').click();
    await sheet.locator('.fmt-chip', { hasText: '文件格式' }).click();
    await expect(page.locator('.fmt-panel.layout')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  });
});
