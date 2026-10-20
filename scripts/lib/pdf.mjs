// Official A4 PDF of every formal version: documents/<slug>/pdf/<version>.pdf.
// Generated when the site is deployed, so everyone downloads the same file.
// Archived documents get none: their public page no longer shows the content.
import { displayDateTime } from '../../src/engine/date.js';
import { chromium } from '@playwright/test';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { ROOT, loadConfig, loadDocuments } from './site.mjs';
import { buildFonts } from './fonts.mjs';
import { docxFromHtml } from './docx-export.mjs';
import { zip } from './zip.mjs';
import { documentTypographyCss } from '../../src/engine/typography.js';
import { layoutCss } from '../../src/engine/layout.js';

// Header and footer templates cannot load web fonts: they use the system's Noto CJK.
const FONT = `-apple-system,'PingFang TC','Noto Sans TC','Noto Sans CJK TC','Microsoft JhengHei',sans-serif`;
// The page content uses the site's own font files (the same as on screen), served from disk.
const FONT_ORIGIN = 'https://edoc-fonts.invalid';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const detail = (details, prefix) => {
  const line = details.find((d) => d.startsWith(prefix));
  return line ? line.slice(prefix.length) : null;
};

export function taipeiTime(iso) { return displayDateTime(iso)+'（台北時間）'; }

export function pdfHtml({ version, html, hash, url, created, editor, layout = null }) {
  const rows = [
    `版本：${esc(version)}`,
    created && `建立時間：${esc(taipeiTime(created))}`,
    editor && `編輯者：${esc(editor)}`,
  ].filter(Boolean).join('　');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONT_ORIGIN}/fonts.css"><style>
body{color:#111;line-height:1.75;margin:0}
${documentTypographyCss('body')}
h1{line-height:1.35;margin:0 0 14pt}
h2{margin:16pt 0 6pt;break-after:avoid} h3{break-after:avoid}
ul{padding-left:17pt;margin:4pt 0} li{margin:2.5pt 0;break-inside:avoid} ul ul{margin-top:2pt}
hr{border:none;border-top:0.6pt solid #bbb;margin:12pt 0} hr[data-edoc-break]{border:none;margin:0;height:0}
table{margin:6pt 0} tr{break-inside:avoid}
.verify{margin-top:20pt;border:0.8pt solid #999;border-radius:3pt;padding:8pt 11pt;font-size:8.5pt;color:#222;break-inside:avoid}
.verify b{font-size:9.5pt} .verify code{font-family:Menlo,Consolas,monospace;font-size:7.8pt;word-break:break-all}
.verify p{margin:3pt 0}
${layoutCss('body', layout)}
</style></head><body>${html}
<div class="verify"><b>文件驗證資訊</b>
<p>${rows}</p>
<p>SHA-256：<code>${esc(hash)}</code></p>
<p>公開網址：${esc(url)}</p>
<p>比對方式：到公開網址切換到 ${esc(version)}，版本卡上的 SHA-256 應與上方相同。SHA-256 用來確認內容未被更動，不等同電子簽章。</p></div>
</body></html>`;
}

// Convenience copies next to the official PDF (R2.16): Word, and the PDF's pages as PNG
// (one page → <v>.png, several → <v>.zip). PNG needs poppler's pdftoppm.
async function writeExports({ dir, pdf, title, version, html, hash, created, layout }) {
  await mkdir(dir, { recursive: true });
  const written = [join(dir, `${version}.docx`)];
  await writeFile(written[0], docxFromHtml({ html, title, version, hash, created, layout }));
  const tmp = await mkdtemp(join(tmpdir(), 'edoc-png-'));
  try {
    execFileSync('pdftoppm', ['-r', '150', '-png', pdf, join(tmp, 'p')], { stdio: 'ignore' });
    const pages = (await readdir(tmp)).filter((f) => f.endsWith('.png')).sort();
    await rm(join(dir, `${version}.png`), { force: true });
    await rm(join(dir, `${version}.zip`), { force: true });
    if (pages.length === 1) {
      written.push(join(dir, `${version}.png`));
      await writeFile(written[1], await readFile(join(tmp, pages[0])));
    } else {
      written.push(join(dir, `${version}.zip`));
      const files = [];
      for (const [i, f] of pages.entries()) files.push({ name: `${title}_${version}_第${i + 1}頁.png`, data: await readFile(join(tmp, f)), store: true });
      await writeFile(written[1], zip(files));
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
  return written;
}

export async function generatePdfs({ outDir, versions: only, exports = true } = {}) {
  const [config, entries] = await Promise.all([loadConfig(), loadDocuments(), buildFonts()]);
  const written = [];
  const browser = await chromium.launch();
  try {
    for (const { slug, doc } of entries.filter((e) => !e.doc.archived)) {
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
          layout: EDoc.versions[v].layout || null,
        })), only || null);
      await page.close();

      // Content is rendered with JavaScript disabled.
      const context = await browser.newContext({ javaScriptEnabled: false });
      await context.route(FONT_ORIGIN + '/**', async (route) => {
        const name = new URL(route.request().url()).pathname.slice(1);
        if (!/^[\w.-]+\.(css|woff2)$/.test(name)) return route.abort();
        const body = await readFile(join(ROOT, 'fonts', name)).catch(() => null);
        if (!body) return route.abort();
        await route.fulfill({ body, contentType: name.endsWith('.css') ? 'text/css' : 'font/woff2' });
      });
      const pdfPage = await context.newPage();
      const dir = outDir ? join(outDir, slug) : join(ROOT, 'documents', slug, 'pdf');
      const exportDir = outDir ? join(outDir, slug, 'export') : join(ROOT, 'documents', slug, 'export');
      await mkdir(dir, { recursive: true });
      const url = new URL(`documents/${slug}/`, config.siteUrl).href;
      const small = `font-family:${FONT};font-size:7.5pt;color:#777;width:100%;margin:0 20mm;display:flex;justify-content:space-between`;
      for (const v of versions) {
        await pdfPage.setContent(pdfHtml({
          version: v.version, html: v.html, hash: v.hash, url,
          created: detail(v.details, '建立時間：'), editor: detail(v.details, '編輯者：'), layout: v.layout,
        }), { waitUntil: 'networkidle' });
        const path = join(dir, `${v.version}.pdf`);
        await pdfPage.pdf({
          // Bookmarks from the headings (R2.18); Chromium builds them from a tagged (accessible) PDF.
          path, format: 'A4', printBackground: true, outline: true, tagged: true,
          margin: { top: '22mm', bottom: '20mm', left: '20mm', right: '20mm' },
          displayHeaderFooter: true,
          headerTemplate: `<div style="${small}"><span>${esc(doc.title)}</span><span>${esc(v.version)}</span></div>`,
          footerTemplate: `<div style="${small}"><span>SHA-256 ${v.hash.slice(0, 8)}…${v.hash.slice(-8)} · ${esc(new URL(config.siteUrl).host)}</span><span>第 <span class="pageNumber"></span>／<span class="totalPages"></span> 頁</span></div>`,
        });
        written.push(path);
        if (exports) await writeExports({ dir: exportDir, pdf: path, title: doc.title, version: v.version, html: v.html, hash: v.hash, created: detail(v.details, '建立時間：'), layout: v.layout });
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return written;
}
