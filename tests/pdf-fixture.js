// Builds small PDFs for tests: html printed by Chromium (a real PDF with embedded subset fonts),
// the same way Word or Google Docs exports carry their text.
import { chromium } from '@playwright/test';

const STYLE = `<style>
  @page { size: A4; margin: 20mm; }
  /* Latin text in Helvetica/Liberation so bold and italic show in the embedded font names on every OS. */
  body { font: 11pt/1.6 Helvetica, Arial, "Liberation Sans", "PingFang TC", "Noto Sans CJK TC", sans-serif; }
  h1 { font-size: 22pt; } h2 { font-size: 15pt; } p, li { margin: 0 0 6pt; }
  /* Bullets as text, like Word and Google Docs exports (Chromium draws a plain disc as a shape). */
  ul.typed { list-style-type: "•  "; } ul.typed ul { list-style-type: "◦  "; }
</style>`;

let browser = null;
export async function htmlToPdf(body, { header = '' } = {}) {
  browser ||= await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><meta charset="utf-8">${STYLE}<body>${body}</body>`);
  const pdf = await page.pdf({
    format: 'A4',
    displayHeaderFooter: !!header,
    headerTemplate: header ? `<div style="font-size:9pt;width:100%;text-align:center">${header}</div>` : '<span></span>',
    footerTemplate: header ? '<div style="font-size:9pt;width:100%;text-align:center"><span class="pageNumber"></span></div>' : '<span></span>',
    margin: { top: '20mm', bottom: '20mm', left: '20mm', right: '20mm' },
  });
  await page.close();
  return pdf;
}
export async function closePdfBrowser() { await browser?.close(); browser = null; }

const long = '這是一段很長的說明文字，用來測試換行之後是否會被合併成同一個段落，而不是每一行都變成獨立的段落。'.repeat(3);

/**
 * A two-page spec with a title, sections, bold and italic, a wrapped paragraph, nested and numbered
 * lists, a running header and page numbers. Bullets are typed characters ("typed", as Word and
 * Google Docs export them) or shapes Chromium draws (plain discs, as EDoc's own PDFs have).
 */
export const sampleBody = (listClass = 'typed') => `
  <h1>Mini Game 規格書</h1>
  <h2>玩法說明</h2>
  <p>每局 <strong>3 rounds</strong>，可選擇<em>double</em>。</p>
  <p>${long}</p>
  <ul class="${listClass}"><li>第一點<ul><li>子項目</li></ul></li><li>第二點</li></ul>
  <ol><li>步驟一</li><li>步驟二</li></ol>
  <h2 style="break-before: page">結算規則</h2>
  <p>English paragraph that is long enough to wrap onto a second line in the printed PDF so the importer has to join the lines back together.</p>
  <p>結尾</p>`;

/** A one-page "scan": only a picture, no text layer. */
export const scanBody = `<img alt="" width="400" height="300" src="data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ccc"/><path d="M20 20h300v20H20z" fill="#333"/></svg>').toString('base64')}">`;
