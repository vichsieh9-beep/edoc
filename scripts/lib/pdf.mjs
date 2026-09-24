// Official A4 PDF of every formal version: documents/<slug>/pdf/<version>.pdf.
// Generated when the site is deployed, so everyone downloads the same file.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadConfig, loadDocuments } from './site.mjs';

const FONT = `-apple-system,'PingFang TC','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const detail = (details, prefix) => {
  const line = details.find((d) => d.startsWith(prefix));
  return line ? line.slice(prefix.length) : null;
};

export function taipeiTime(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}（台北時間）`;
}

export function pdfHtml({ version, html, hash, url, created, editor }) {
  const rows = [
    `版本：${esc(version)}`,
    created && `建立時間：${esc(taipeiTime(created))}`,
    editor && `編輯者：${esc(editor)}`,
  ].filter(Boolean).join('　');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><style>
body{font-family:${FONT};color:#111;font-size:10.5pt;line-height:1.75;margin:0}
h1{font-size:17pt;line-height:1.35;margin:0 0 14pt}
h2{font-size:12.5pt;margin:16pt 0 6pt;break-after:avoid}
ul{padding-left:17pt;margin:4pt 0} li{margin:2.5pt 0;break-inside:avoid} ul ul{margin-top:2pt}
hr{border:none;border-top:0.6pt solid #bbb;margin:12pt 0}
table{border-collapse:collapse} td,th{border:0.6pt solid #999;padding:3pt 5pt}
.verify{margin-top:20pt;border:0.8pt solid #999;border-radius:3pt;padding:8pt 11pt;font-size:8.5pt;color:#222;break-inside:avoid}
.verify b{font-size:9.5pt} .verify code{font-family:Menlo,Consolas,monospace;font-size:7.8pt;word-break:break-all}
.verify p{margin:3pt 0}
</style></head><body>${html}
<div class="verify"><b>文件驗證資訊</b>
<p>${rows}</p>
<p>SHA-256：<code>${esc(hash)}</code></p>
<p>公開網址：${esc(url)}</p>
<p>比對方式：到公開網址切換到 ${esc(version)}，版本卡上的 SHA-256 應與上方相同。SHA-256 用來確認內容未被更動，不等同電子簽章。</p></div>
</body></html>`;
}

export async function generatePdfs({ outDir, versions: only } = {}) {
  const [config, entries] = await Promise.all([loadConfig(), loadDocuments()]);
  const written = [];
  const browser = await chromium.launch();
  try {
    for (const { slug, doc } of entries) {
      // The built page provides the engine (clean snapshot, filtering, hashes).
      const page = await browser.newPage();
      await page.goto(pathToFileURL(join(ROOT, 'documents', slug, 'index.html')).href);
      await page.waitForFunction(() => window.EDoc && Object.values(EDoc.versions).every((v) => v.hash));
      const versions = await page.evaluate((only) => EDoc.versionOrder()
        .filter((v) => !only || only.includes(v))
        .map((v) => ({
          version: v,
          html: EDoc.sanitizeRevisionHtml(EDoc.cleanSnapshot(EDoc.versions[v].html)),
          hash: EDoc.versions[v].hash,
          details: EDoc.versions[v].details,
        })), only || null);
      await page.close();

      // Content is rendered with JavaScript disabled.
      const context = await browser.newContext({ javaScriptEnabled: false });
      const pdfPage = await context.newPage();
      const dir = outDir ? join(outDir, slug) : join(ROOT, 'documents', slug, 'pdf');
      await mkdir(dir, { recursive: true });
      const url = new URL(`documents/${slug}/`, config.siteUrl).href;
      const small = `font-family:${FONT};font-size:7.5pt;color:#777;width:100%;margin:0 20mm;display:flex;justify-content:space-between`;
      for (const v of versions) {
        await pdfPage.setContent(pdfHtml({
          version: v.version, html: v.html, hash: v.hash, url,
          created: detail(v.details, '建立時間：'), editor: detail(v.details, '編輯者：'),
        }), { waitUntil: 'load' });
        const path = join(dir, `${v.version}.pdf`);
        await pdfPage.pdf({
          path, format: 'A4', printBackground: true,
          margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
          displayHeaderFooter: true,
          headerTemplate: `<div style="${small}"><span>${esc(doc.title)}</span><span>${esc(v.version)}</span></div>`,
          footerTemplate: `<div style="${small}"><span>SHA-256 ${v.hash.slice(0, 8)}…${v.hash.slice(-8)} · ${esc(new URL(config.siteUrl).host)}</span><span>第 <span class="pageNumber"></span>／<span class="totalPages"></span> 頁</span></div>`,
        });
        written.push(path);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return written;
}
