// R2.16 convenience copies of each formal version: Word (.docx) and the PDF's pages as PNG.
import { test, expect } from '@playwright/test';
import { readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { join } from 'node:path';
import { generatePdfs } from '../scripts/lib/pdf.mjs';
import { docxFromHtml } from '../scripts/lib/docx-export.mjs';

function unzip(buf) {
  const files = {};
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = buf.readUInt16LE(eocd + 10); n > 0; n--) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files[name] = method === 8 ? inflateRawSync(data) : data;
    p += 46 + nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return files;
}
const SAMPLE = '<h1>樣張</h1><p style="text-align:center"><strong>粗</strong><em>斜</em><u>底</u><s>刪</s>X<sup>2</sup></p>' +
  '<h2>章節</h2><p><span style="color:#ff0000">紅</span><span style="background-color:#ffff00">黃</span><span style="font-family:\'Noto Serif TC\',serif">宋</span><span style="font-size:14pt">大</span>' +
  '<a href="https://example.com/a?b=1&amp;c=2">連結</a></p><h3>小節</h3><ul><li>一<ul><li>二</li></ul></li></ul><ol><li>甲</li></ol>' +
  '<table><tbody><tr><th>欄</th><th>欄二</th><th>欄三</th></tr><tr><th>欄</th><td colspan="2">合併</td></tr></tbody></table><hr data-edoc-break="page"><p>次頁</p>';

test('the Word copy carries the formatting, the version and the official-version note', () => {
  const parts = unzip(docxFromHtml({ html: SAMPLE, title: '樣張', version: 'v1.0', hash: 'c'.repeat(64), created: '2026-10-20T01:00:00Z' }));
  for (const name of ['[Content_Types].xml', 'word/document.xml', 'word/styles.xml', 'word/numbering.xml', 'word/footer1.xml', 'word/fontTable.xml']) expect(parts[name], name).toBeTruthy();
  const doc = parts['word/document.xml'].toString();
  expect(doc).toContain('<w:pStyle w:val="Heading1"/>');
  expect(doc).toContain('<w:pStyle w:val="Heading3"/>');
  expect(doc).toContain('<w:jc w:val="center"/>');
  for (const tag of ['<w:b/>', '<w:i/>', '<w:u w:val="single"/>', '<w:strike/>', '<w:vertAlign w:val="superscript"/>', '<w:color w:val="FF0000"/>', '<w:highlight w:val="yellow"/>', 'w:eastAsia="Noto Serif TC"', '<w:sz w:val="28"/>', '<w:gridSpan w:val="2"/>']) expect(doc, tag).toContain(tag);
  expect(doc).toMatch(/<w:numPr><w:ilvl w:val="1"\/><w:numId w:val="1"\/><\/w:numPr>/);
  // R2.17 tables: full width, fixed equal columns, a grey header row that repeats on each page.
  expect(doc).toContain('<w:tblW w:w="5000" w:type="pct"/>');
  expect(doc).toContain('<w:tblLayout w:type="fixed"/>');
  expect(doc).toContain('<w:br w:type="page"/>');
  expect(doc).toContain('<w:tr><w:trPr><w:tblHeader/></w:trPr>');
  expect(doc).toContain('<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>');
  expect(doc).toMatch(/<w:hyperlink r:id="rIdLink1">/);
  expect(parts['word/_rels/document.xml.rels'].toString()).toContain('Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"');
  expect(parts['word/numbering.xml'].toString()).toContain('<w:numFmt w:val="decimal"/>');
  const footer = parts['word/footer1.xml'].toString();
  expect(footer).toContain('版本 v1.0｜SHA-256 cccccccc…cccccccc｜正式版以 PDF 為準');
  // Same input, same bytes: the copies are rebuilt with every deploy.
  expect(docxFromHtml({ html: SAMPLE, title: '樣張', version: 'v1.0', hash: 'c'.repeat(64), created: '2026-10-20T01:00:00Z' }))
    .toEqual(docxFromHtml({ html: SAMPLE, title: '樣張', version: 'v1.0', hash: 'c'.repeat(64), created: '2026-10-20T01:00:00Z' }));
});

test('the Word copy carries the version\'s document format (R2.17)', () => {
  const parts = unzip(docxFromHtml({ html: '<p>內文</p><ul><li>項</li></ul><h2>章</h2>', title: 't', version: 'v1', hash: 'c'.repeat(64), layout: { font: 'serif', size: '14', lineHeight: '1.5', spacing: 'wide', indent: '2' } }));
  const styles = parts['word/styles.xml'].toString(), doc = parts['word/document.xml'].toString();
  expect(styles).toContain('w:eastAsia="Noto Serif TC"');
  expect(styles).toContain('<w:sz w:val="28"/>');
  expect(styles).toContain('<w:spacing w:after="240" w:line="420" w:lineRule="atLeast"/>');
  // First-line indent on body paragraphs, not on list items or headings.
  expect(doc.match(/w:firstLineChars="200"/g)).toHaveLength(1);
  const plain = unzip(docxFromHtml({ html: '<p>內文</p>', title: 't', version: 'v1', hash: 'c'.repeat(64) }))['word/styles.xml'].toString();
  expect(plain).toContain('<w:spacing w:after="120" w:line="360" w:lineRule="auto"/>');
  expect(plain).toContain('<w:sz w:val="24"/>');
});

test('an edited Word copy comes back through 新增文件 › 上傳 Word with its headings, lists and bold', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.EDocLibrary);
  const bytes = docxFromHtml({ html: SAMPLE, title: '樣張', version: 'v1.0', hash: 'c'.repeat(64) });
  const result = await page.evaluate(async (b) => EDocLibrary.docxToHtml(new Uint8Array(b), { title: '樣張' }), [...bytes]);
  expect(result.html).toContain('<h1>樣張</h1>');
  expect(result.html).toContain('<h2>章節</h2>');
  expect(result.html).toMatch(/<strong>粗<\/strong>/);
  expect(result.html).toMatch(/<ul>\s*<li>一\s*<ul>\s*<li>二<\/li>/);
});

test('every version gets a Word copy and its pages as PNG (one page: .png, several: .zip)', async ({}, testInfo) => {
  test.skip(!(() => { try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })(), 'poppler (pdftoppm) is not installed');
  const out = testInfo.outputPath('site');
  await generatePdfs({ outDir: out, versions: ['v0.1', 'v0.7'] });
  const qa = join(out, 'qa-senior-game-qa', 'export');
  const docx = unzip(await readFile(join(qa, 'v0.7.docx')));
  expect(docx['word/document.xml'].toString()).toContain('資深遊戲測試工程師');
  // The QA document runs over two pages: its pages come as one zip of PNG files.
  const pages = unzip(await readFile(join(qa, 'v0.7.zip')));
  const names = Object.keys(pages);
  expect(names.length).toBeGreaterThanOrEqual(2);
  expect(names[0]).toMatch(/_v0\.7_第1頁\.png$/);
  for (const n of names) expect(pages[n].subarray(1, 4).toString()).toBe('PNG');
  // The sandbox fits on one page: a single PNG of A4 at 150 dpi.
  const png = await readFile(join(out, 'edoc-sandbox', 'export', 'v0.1.png'));
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(Math.abs(png.readUInt32BE(16) - 1241)).toBeLessThanOrEqual(1); // A4 width at 150 dpi
  expect((await stat(join(out, 'edoc-sandbox', 'export', 'v0.1.docx'))).size).toBeGreaterThan(1000);
});
