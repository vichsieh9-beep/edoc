// New documents from PDF (src/engine/pdf.js), run in the library page of each browser: the
// conversion happens in the reader's browser. Test PDFs are printed by Chromium (tests/pdf-fixture.js).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { closePdfBrowser, htmlToPdf, sampleBody, scanBody } from './pdf-fixture.js';

async function convert(page, buffer, title = '') {
  return page.evaluate(async ([bytes, title]) => {
    try {
      return await EDocLibrary.pdfToHtml(new Uint8Array(bytes), { title });
    } catch (e) {
      return { error: e.message };
    }
  }, [[...buffer], title]);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.EDocLibrary);
});
test.afterAll(closePdfBrowser);

const SAMPLE = [
  '<h1>Mini Game 規格書</h1>',
  '<h2>玩法說明</h2>',
  '<p>每局 <strong>3 rounds</strong>，可選擇<em>double</em>。</p>',
  `<p>${'這是一段很長的說明文字，用來測試換行之後是否會被合併成同一個段落，而不是每一行都變成獨立的段落。'.repeat(3)}</p>`,
  '<ul><li>第一點<ul><li>子項目</li></ul></li><li>第二點</li></ul>',
  '<ol><li>步驟一</li><li>步驟二</li></ol>',
  '<h2>結算規則</h2>',
  '<p>English paragraph that is long enough to wrap onto a second line in the printed PDF so the importer has to join the lines back together.</p>',
  '<p>結尾</p>',
].join('\n');

test('PDF: title, sections, bold, italic, wrapped paragraphs, lists; running header and page numbers are dropped', async ({ page }) => {
  const pdf = await htmlToPdf(sampleBody(), { header: 'Mini Game 規格書 · 內部文件' });
  const { html, report } = await convert(page, pdf);
  expect(html).toBe(SAMPLE);
  expect(report).toEqual({ pages: 2, headings: 3, paragraphs: 4, listItems: 5, images: 0, emptyPages: [], runningLines: 4, unreadable: 0 });
});

test('PDF: bullets drawn as shapes (plain discs) are lists too', async ({ page }) => {
  const { html } = await convert(page, await htmlToPdf(sampleBody('drawn')));
  expect(html).toBe(SAMPLE);
});

test('PDF: without a single title heading, the document name becomes the title', async ({ page }) => {
  // Headings not bold and holding more text than the body: only the larger size marks them
  // (Linux renders CJK bold synthetically, so the font name cannot be relied on there).
  const body = '<h2 style="font-weight:400">職務簡述</h2><p>內容一</p><h2 style="font-weight:400">需求條件</h2><p>內容二</p>';
  const { html } = await convert(page, await htmlToPdf(body), '【QA】新職缺');
  expect(html).toBe('<h1>【QA】新職缺</h1>\n<h2>職務簡述</h2>\n<p>內容一</p>\n<h2>需求條件</h2>\n<p>內容二</p>');
});

test('PDF: a scan, a non-PDF or a broken PDF is refused with a clear message', async ({ page }) => {
  expect((await convert(page, await htmlToPdf(scanBody))).error).toContain('沒有文字層');
  expect((await convert(page, Buffer.from('hello'))).error).toBe('這不是 PDF 檔。');
  expect((await convert(page, Buffer.from('%PDF-1.7\n garbage'))).error).toContain('已損毀');
});

test('PDF: an EDoc document printed to PDF converts back to the same text and list items', async ({ page }) => {
  // Plain <ul> lists: Chromium draws the bullets as shapes, the bold labels use a bold font.
  const doc = JSON.parse(readFileSync(new URL('../documents/qa-senior-game-qa/document.json', import.meta.url), 'utf8'));
  const source = doc.versions[doc.latestVersion].html;
  const result = await convert(page, await htmlToPdf(source));
  const text = (s) => s.replace(/<[^>]+>|\s+/g, '');
  expect(text(result.html)).toBe(text(source));
  expect(result.report.listItems).toBe(source.match(/<li[\s>]/g).length);
});
