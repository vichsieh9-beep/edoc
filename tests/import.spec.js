// New documents from Word and pasted text (src/engine/docx.js, src/engine/import.js),
// run in the library page of each browser: the conversion happens in the reader's browser.
import { test, expect } from '@playwright/test';
import { docx, para, run, sampleDocx } from './docx-fixture.js';

async function convert(page, buffer, title = '') {
  return page.evaluate(async ([bytes, title]) => {
    try {
      return await EDocLibrary.docxToHtml(new Uint8Array(bytes), { title });
    } catch (e) {
      return { error: e.message };
    }
  }, [[...buffer], title]);
}
const normalize = (page, html, title) => page.evaluate(([html, title]) => EDocLibrary.normalizeImportedHtml(html, { title }), [html, title]);

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.EDocLibrary);
});

test('Word: title, sections, lists, bold, links, tables; pictures, comments and headers are counted, not imported', async ({ page }) => {
  const { html, report } = await convert(page, sampleDocx());
  expect(html).toBe([
    '<h1>Mini Game 規格書</h1>',
    '<h2>玩法說明</h2>',
    '<p>每局 <strong>3 回合</strong>，可選擇<em>加倍</em>。詳見<a href="https://example.com/rules">規則</a>與壞連結。</p>',
    '<ul><li>第一點<ul><li>子項目</li></ul></li><li>第二點</li></ul>',
    '<ol><li>步驟一</li><li>步驟二</li></ol>',
    '<p><strong>細節</strong></p>',
    '<p>保留新增字</p>',
    '<table><tbody><tr><td colspan="2">合併標題</td></tr><tr><td rowspan="2">跨列</td><td>A</td></tr><tr><td>B<br>C</td></tr></tbody></table>',
    '<p>結尾<br>第二行</p>',
  ].join('\n'));
  expect(report).toEqual({
    headings: 3, paragraphs: 3, listItems: 5, tables: 1, images: 1, textBoxes: 1, trackedChanges: 2, comments: 2, headersFooters: 2,
  });
});

test('Word: sections without a title keep the top level as sections and take the document name as title', async ({ page }) => {
  const file = docx([para('職務簡述', { style: '1' }), para('內容一'), para('需求條件', { style: '1' }), para('小節', { style: '2' }), para('內容二')].join(''));
  const { html } = await convert(page, file);
  expect(html).toBe('<h2>職務簡述</h2>\n<p>內容一</p>\n<h2>需求條件</h2>\n<p><strong>小節</strong></p>\n<p>內容二</p>');
  const titled = await normalize(page, html, '【QA】新職缺');
  expect(titled.html.startsWith('<h1>【QA】新職缺</h1>\n<h2>職務簡述</h2>')).toBe(true);
  // A single top heading at the very start is the document's own title.
  const own = await convert(page, docx([para('規格書', { style: '1' }), para('小節', { style: '2' }), para([run('粗', { b: true })])].join('')), '檔名');
  expect(own.html).toBe('<h1>規格書</h1>\n<h2>小節</h2>\n<p><strong>粗</strong></p>');
});

test('Word: not a .docx, or a broken file, is refused with a clear message', async ({ page }) => {
  expect((await convert(page, Buffer.from('PK not really a zip'))).error).toContain('不是 Word（.docx）檔');
  const noBody = await convert(page, (await import('./docx-fixture.js')).zip({ 'word/other.xml': '<x/>' }));
  expect(noBody.error).toContain('找不到內文');
});

test('pasted html: Word and Google Docs styles become tags, headings map to the content model, junk is dropped', async ({ page }) => {
  const google = '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt">Mini Game</span></h1>'
    + '<h3>小節</h3><p dir="ltr"><span style="font-weight:700">粗體</span><span style="font-style:italic">斜體</span><span style="color:red;text-decoration:underline">底線</span></p>'
    + '<ul><li><p>項目</p></li></ul><p><img src="https://example.com/x.png"><br></p></b>';
  const g = await normalize(page, google, '名稱');
  expect(g).toEqual({ html: '<h1>Mini Game</h1>\n<p><strong>小節</strong></p>\n<p><strong>粗體</strong><em>斜體</em>底線</p>\n<ul><li><p>項目</p></li></ul>', images: 1 });

  const word = '<p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·<span>&nbsp;</span></span>第一項</p>'
    + '<p class=MsoListParagraph style="mso-list:l0 level2 lfo1"><span style="mso-list:Ignore">o</span>第二層</p>'
    + '<p class=MsoListParagraph style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">·</span>第二項</p><p class=MsoNormal>段落<o:p></o:p></p>'
    + '<!--[if gte mso 9]><xml>junk</xml><![endif]--><h1 class="changed">大標</h1><h1>第二個大標</h1><div><div>區塊</div></div>';
  const w = await normalize(page, word, '文件名稱');
  // Only an h1 at the very start is the document's own title.
  expect(w.html).toBe('<h1>文件名稱</h1>\n<ul><li>第一項<ul><li>第二層</li></ul></li><li>第二項</li></ul>\n<p>段落</p>\n<h2>大標</h2>\n<h2>第二個大標</h2>\n<p>區塊</p>');
  expect((await normalize(page, '<span><h1>標題</h1><p>內文</p></span><h1>第二</h1>', '名稱')).html).toBe('<h1>標題</h1>\n<p>內文</p>\n<h2>第二</h2>');
});

test('pasted html cannot carry scripts, handlers or javascript links', async ({ page }) => {
  const r = await normalize(page, '<p onclick="alert(1)">a<script>alert(2)</script><a href="javascript:alert(3)">b</a><iframe src="x"></iframe></p>', 't');
  expect(r.html).toBe('<h1>t</h1>\n<p>ab</p>');
});

test('pasted plain text: one paragraph per line, dashes and bullets become a list', async ({ page }) => {
  const html = await page.evaluate(() => EDocLibrary.textToHtml('玩法\r\n- 每局 3 回合\n• 加倍 <b>\n\n-5% 不是條列'));
  expect(html).toBe('<p>玩法</p>\n<ul>\n<li>每局 3 回合</li>\n<li>加倍 &lt;b&gt;</li>\n</ul>\n<p>-5% 不是條列</p>');
});
