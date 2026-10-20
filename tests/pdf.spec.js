// Official PDFs (scripts/lib/pdf.mjs): A4, one per formal version, with verification details.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { generatePdfs, pdfHtml, taipeiTime } from '../scripts/lib/pdf.mjs';

test('generates an A4 PDF for the requested version', async ({}, testInfo) => {
  const [file] = await generatePdfs({ outDir: testInfo.outputPath('pdf'), versions: ['v0.7'] });
  expect(file).toMatch(/qa-senior-game-qa\/v0\.7\.pdf$/);
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  const text = bytes.toString('latin1');
  const pages = text.match(/\/Type\s*\/Page[^s]/g) || [];
  expect(pages.length).toBeGreaterThanOrEqual(2);
  const box = text.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
  // A4 is 595.28 × 841.89 pt; Chromium rounds it through inches (595.92 × 842.88).
  expect(Math.abs(parseFloat(box[1]) - 595.28)).toBeLessThan(2);
  expect(Math.abs(parseFloat(box[2]) - 841.89)).toBeLessThan(2);
  // The content is set in the site's own font (the same as on screen), embedded in the file.
  expect(text).toMatch(/FontName\s*\/[A-Z]{6}\+NotoSansTC/);
  // Bookmarks: the title, with every section under it (R2.18).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const outline = await (await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise).getOutline();
  expect(outline).toHaveLength(1);
  expect(outline[0].title).toContain('資深遊戲測試工程師');
  expect(outline[0].items.map((i) => i.title)).toEqual(['【職務簡述】', '【期望特質】', '【需求條件】', '【加分項目】']);
});

test('the PDF uses the shared type scale and the bundled fonts', () => {
  const html = pdfHtml({ version: 'v1.0', html: '<h1>標題</h1>', hash: 'b'.repeat(64), url: 'https://example.test/' });
  expect(html).toContain("body{font-family:'Noto Sans TC',sans-serif;font-size:12pt}");
  expect(html).toContain('body h1{font-size:20pt}');
  expect(html).toContain('body h2{font-size:15pt}');
  expect(html).toContain('/fonts.css">');
});

test('verification block lists version, time, editor, full hash and public URL', () => {
  const html = pdfHtml({
    version: 'v0.8', html: '<h1>標題</h1>', hash: 'a'.repeat(64),
    url: 'https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/',
    created: '2026-09-24T01:02:00.000Z', editor: '客戶法務',
  });
  expect(html).toContain('版本：v0.8');
  expect(html).toContain('建立時間：26/09/24 09:02（台北時間）');
  expect(html).toContain('編輯者：客戶法務');
  expect(html).toContain('a'.repeat(64));
  expect(html).toContain('不等同電子簽章');
  expect(taipeiTime('2026-12-31T16:30:00Z')).toBe('27/01/01 00:30（台北時間）');
});
