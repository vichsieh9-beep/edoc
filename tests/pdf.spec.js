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
});

test('verification block lists version, time, editor, full hash and public URL', () => {
  const html = pdfHtml({
    version: 'v0.8', html: '<h1>標題</h1>', hash: 'a'.repeat(64),
    url: 'https://vichsieh9-beep.github.io/edoc/documents/qa-senior-game-qa/',
    created: '2026-09-24T01:02:00.000Z', editor: '客戶法務',
  });
  expect(html).toContain('版本：v0.8');
  expect(html).toContain('建立時間：2026-09-24 09:02（台北時間）');
  expect(html).toContain('編輯者：客戶法務');
  expect(html).toContain('a'.repeat(64));
  expect(html).toContain('不等同電子簽章');
  expect(taipeiTime('2026-12-31T16:30:00Z')).toBe('2027-01-01 00:30（台北時間）');
});
