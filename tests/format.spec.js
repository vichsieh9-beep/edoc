// R2.16 formatting: content model, format-aware diff, paste and Worker parity (engine level).
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { buildFormalDiff, analyzeFormalDiff } from '../src/engine/diff.js';
import { contentContext, trustedContent, buildPublishedContent } from '../worker/src/content.js';

let bundle;
test.beforeAll(async () => {
  const out = await build({
    stdin: {
      contents: `import * as diff from './src/engine/diff.js'; import * as rev from './src/engine/revision.js';
        import * as imp from './src/engine/import.js'; import * as ch from './src/engine/changes.js';
        import * as text from './src/engine/text.js'; import * as sp from './src/engine/suggestion-patches.js';
        import * as dom from './src/engine/dom.js';
        window.E={...diff,...rev,...imp,...ch,...text,...sp,...dom};`,
      resolveDir: process.cwd(),
    },
    bundle: true, write: false, format: 'iife',
  });
  bundle = out.outputFiles[0].text;
});
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.addScriptTag({ content: bundle });
});

const BASE = '<h1>標題</h1><h2>【職務】</h2><ul><li>負責 iGaming 遊戲品質驗證。</li><li>撰寫測試案例。</li></ul><p>結尾段落。</p>';
const run = (page, base, draft) => page.evaluate(([a, b]) => {
  const html = E.buildFormalDiff(a, b), w = document.createElement('div');
  w.innerHTML = html;
  const text = (sel) => [...w.querySelectorAll(sel)].map((n) => n.textContent).join('|');
  return { html, stats: E.analyzeFormalDiff(html), changed: text('.changed'), deleted: text('.deleted'), formatted: text('span.format-changed'),
    notes: [...w.querySelectorAll('.format-changed')].map((n) => n.getAttribute('data-edoc-fmt')), changes: E.listChanges(html) };
}, [base, draft]);

test('bolding two characters marks only those two characters', async ({ page }) => {
  const r = await run(page, BASE, BASE.replace('負責 iGaming', '<b>負責</b> iGaming'));
  expect(r.formatted).toBe('負責');
  expect(r.notes).toEqual(['+b']);
  expect(r.changed).toBe('');
  expect(r.deleted).toBe('');
  expect(r.stats.summary).toBe('職務 1 處格式變更');
  expect(r.stats.formattedBlocks).toBe(1);
  expect(r.changes).toEqual([{ section: '職務', type: 'format', text: '負責 iGaming 遊戲品質驗證。', formats: '粗體' }]);
});

for (const [name, markup, note, label] of [
  ['text colour', '<span style="color: rgb(255, 0, 0);">品質驗證</span>', 'color', '文字色彩'],
  ['highlight', '<span style="background-color: rgb(255, 255, 0);">品質驗證</span>', 'bg', '螢光筆'],
  ['font', '<span style="font-family: &quot;Noto Serif TC&quot;, serif;">品質驗證</span>', 'font', '字型'],
  ['font size command', '<font size="5">品質驗證</font>', 'size', '字級'],
  ['underline', '<u>品質驗證</u>', '+u', '底線'],
  ['strikethrough', '<strike>品質驗證</strike>', '+s', '刪除線'],
]) test(`${name} is a format change of exactly that text`, async ({ page }) => {
  const r = await run(page, BASE, BASE.replace('品質驗證', markup));
  expect(r.formatted).toBe('品質驗證');
  expect(r.notes).toEqual([note]);
  expect(r.changes[0].formats).toBe(label);
});

test('editor residue is not formatting: computed colours, px sizes, weights, unknown fonts', async ({ page }) => {
  for (const residue of [
    '<span style="color: rgb(31, 31, 31); font-size: 16px; font-weight: 400;">品質驗證</span>',
    '<span style="font-family: Georgia, serif; line-height: 1.7;">品質驗證</span>',
    '<span style="color: rgb(29, 78, 216);">品質驗證</span>',
    '<font color="red">品質驗證</font>',
    '<span style="font-size: 12pt;">品質驗證</span>',
  ]) {
    const r = await run(page, BASE, BASE.replace('品質驗證', residue));
    expect(r.stats.summary, residue).toBe('未偵測到內容變更');
  }
});

test('block formatting marks the block itself, never as delete plus add', async ({ page }) => {
  for (const [draft, note] of [
    [BASE.replace('<p>結尾段落。</p>', '<h2>結尾段落。</h2>'), 'style'],
    [BASE.replace('<p>結尾段落。</p>', '<h3>結尾段落。</h3>'), 'style'],
    [BASE.replace('<p>結尾段落。</p>', '<p style="text-align: center;">結尾段落。</p>'), 'align'],
    [BASE.replace('<li>撰寫測試案例。</li>', '<ul><li>撰寫測試案例。</li></ul>'), 'indent'],
    [BASE.replace('<ul>', '<ol>').replace('</ul>', '</ol>'), 'list'],
  ]) {
    const r = await run(page, BASE, draft);
    expect(r.deleted, note).toBe('');
    expect(r.changed, note).toBe('');
    expect(r.notes.every((n) => n === note), note).toBe(true);
    expect(r.stats.addedBlocks + r.stats.deletedBlocks + r.stats.modifiedBlocks, note).toBe(0);
    expect(r.stats.formattedBlocks, note).toBeGreaterThan(0);
  }
});

test('text and formatting changed together: one modification, both described', async ({ page }) => {
  const r = await run(page, BASE, BASE.replace('負責 iGaming 遊戲', '<b>負責</b> iGaming 手機遊戲'));
  expect(r.changed).toBe('手機');
  expect(r.formatted).toBe('負責');
  expect(r.stats.summary).toBe('職務 1 處修改');
  expect(r.changes[0]).toMatchObject({ type: 'modified', formats: '粗體' });
});

test('underline survives display and the next version starts white', async ({ page }) => {
  const r = await page.evaluate((base) => {
    const v1 = E.buildFormalDiff(base, base.replace('撰寫', '<u>撰寫</u>'));
    const shown = E.sanitizeRevisionHtml(E.cleanSnapshot(v1));
    // Next draft starts from what is shown and only edits the last paragraph.
    const v2 = E.buildFormalDiff(v1, shown.replace('結尾', '收尾'));
    return { shown, v2, stats: E.analyzeFormalDiff(v2).summary };
  }, BASE);
  expect(r.shown).toMatch(/<u>(?:<span>)?撰寫(?:<\/span>)?<\/u>/); // a removed mark leaves a bare span, like .changed
  expect(r.v2).not.toContain('format-changed');
  expect(r.stats).toBe('職務 1 處修改');
});

test('only palette styles survive: injected CSS never reaches stored html', async ({ page }) => {
  const out = await page.evaluate(() => [
    '<span style="color:#ff0000;background:url(https://x.test/a.png);position:fixed;top:0">甲</span>',
    '<span style="color:red;background-image:url(javascript:alert(1))">乙</span>',
    '<span style="font-family:\'Noto Serif TC\';font-size:expression(alert(1))">丙</span>',
    '<span style="color:var(--changed);font-size:14pt !important">丁</span>',
    '<span style="col\\6fr:#ff0000;font-size:14pt">戊</span>',
    '<p style="text-align:center;display:none">己</p><p align="right">庚</p>',
    '<p class="doc-head modal-backdrop changed">辛</p><span class="x">壬</span>',
    '<span data-edoc-fmt="+b">癸</span><span data-edoc-fmt="\\"><img src=x onerror=alert(1)>">子</span>',
  ].map((h) => { const once = E.sanitizeRevisionHtml(h); return { once, twice: E.sanitizeRevisionHtml(once) }; }));
  const all = out.map((o) => o.once).join('');
  expect(all).not.toMatch(/url|expression|position|display|var\(|important|onerror|modal|doc-head/i);
  expect(out[0].once).toBe('<span style="color:#ff0000">甲</span>');
  expect(out[2].once).toBe('<span style="font-family:\'Noto Serif TC\',serif">丙</span>');
  expect(out[3].once).toBe('丁'); // a declaration with !important is dropped whole
  expect(out[5].once).toBe('<p style="text-align:center">己</p><p style="text-align:right">庚</p>');
  expect(out[6].once).toBe('<p class="changed">辛</p><span>壬</span>');
  for (const o of out) expect(o.twice).toBe(o.once);
});

test('pasted Word and Google Docs html keeps supported formatting only', async ({ page }) => {
  const r = await page.evaluate(() => ({
    google: E.normalizePastedHtml('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr" style="line-height:1.38;text-align:center;"><span style="font-size:14pt;font-family:Arial,sans-serif;color:#ff0000;font-weight:700;text-decoration:underline;">紅粗底</span><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;">一般的內文比較長一點</span></p></b>'),
    word: E.normalizePastedHtml('<p class=MsoNormal style="text-align:right"><span style="font-family:新細明體;color:#7030A0">紫明體</span><s>刪</s></p><h4>小節</h4>'),
    edoc: E.normalizePastedHtml('<li>保留<span class="changed" style="color: rgb(29, 78, 216); text-decoration: underline;">新增字</span><span class="deleted" style="color: rgb(185, 28, 28); text-decoration: line-through;">舊字</span></li>'),
  }));
  // Most of the text is Google Docs' 11pt Arial body: dropped; the 14pt emphasis is kept.
  expect(r.google).toBe('<p style="text-align:center"><span style="color:#ff0000;font-size:14pt"><u><strong>紅粗底</strong></u></span>一般的內文比較長一點</p>');
  // 新細明體 is half of the pasted text, i.e. the source's body font: dropped like its size.
  expect(r.word).toBe('<p style="text-align:right"><span style="color:#7030a0">紫明體</span><s>刪</s></p><h3>小節</h3>');
  // A font used for a minority of the text is deliberate and kept (mapped to the bundled font).
  expect(await page.evaluate(() => E.normalizePastedHtml('<p>一般內文一般內文一般內文<span style="font-family:新細明體">明體</span></p>')))
    .toBe('<p>一般內文一般內文一般內文<span style="font-family:\'Noto Serif TC\',serif">明體</span></p>');
  expect(r.edoc).toBe('<li>保留新增字</li>');
});

test('copy full text keeps formatting for Word and Google Docs', async ({ page }) => {
  const html = await page.evaluate(() => E.clipboardHtml('<p class="changed" style="text-align:center">置中<span style="color:#ff0000">紅</span><span>素</span><u>底</u></p>'));
  expect(html).toBe('<p style="text-align:center">置中<span style="color:#ff0000">紅</span>素<u>底</u></p>');
});

test('the Worker and the page produce the same formatted content, diff and statistics', async ({ page }) => {
  const draft = BASE.replace('負責 iGaming', '<b>負責</b> iGaming').replace('品質驗證', '<span style="color:#ff0000">品質驗證</span>')
    .replace('<p>結尾段落。</p>', '<h3 style="text-align:center">結尾段落。</h3>').replace('<li>撰寫測試案例。</li>', '<ul><li>撰寫<u>測試</u>案例。</li></ul>');
  const browser = await page.evaluate(([a, b]) => {
    const clean = E.prepareSuggestionContent(b), html = E.buildFormalDiff(E.prepareSuggestionContent(a), clean);
    return { clean, html, summary: E.analyzeFormalDiff(html).summary };
  }, [BASE, draft]);
  const worker = await buildPublishedContent(BASE, draft);
  expect(browser.clean).toBe(trustedContent(draft));
  expect(browser.html).toBe(worker.html);
  expect(browser.summary).toBe(worker.summary);
  expect(worker.html).toContain('style="color:#ff0000"');
  expect(worker.html).toContain('class="format-changed" data-edoc-fmt="style align" style="text-align:center"');
  // The plain engine in the Worker's DOM agrees as well.
  expect(buildFormalDiff(BASE, draft, contentContext())).toBe(await page.evaluate(([a, b]) => E.buildFormalDiff(a, b), [BASE, draft]));
  expect(analyzeFormalDiff(worker.html, contentContext()).formattedBlocks).toBe(3);
});
