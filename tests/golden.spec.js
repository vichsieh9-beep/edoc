// Golden tests: lock exact engine output so refactors cannot change behavior silently.
// - Version hashes must never change: exported revision packages carry baseHash, and a
//   different hash would turn every outstanding revision into a false Conflict.
// - Formal diff / summary / sanitizer output is compared byte for byte with tests/__golden__.
//   Only regenerate (npx playwright test tests/golden.spec.js --update-snapshots) for an
//   intended engine behavior change, and review the snapshot diff.
import { test, expect } from '@playwright/test';
import { DOC_URL } from './helpers.js';

const HASHES = {
  'v0.1': '89c9de90d5dfd317d7472c26c98bb8d35b871e9ea640e21250c019b67724ce24',
  'v0.2': '0454099eeffc2778ebb8a1a2ed3da74731ab6b09be08a0ceb67f45c6b8dedf4f',
  'v0.3': '5f2297c6e95779fe5151e354b20aa0f53df08d7a87dbbcb2ac73e5a36344e59c',
  'v0.4': '5f2297c6e95779fe5151e354b20aa0f53df08d7a87dbbcb2ac73e5a36344e59c',
  'v0.5': '5f2297c6e95779fe5151e354b20aa0f53df08d7a87dbbcb2ac73e5a36344e59c',
  'v0.6': '832bee75fac044d10d26585e970dc729ff611c0bc99ab38b9591f93ff3de1fa8',
  'v0.7': '832bee75fac044d10d26585e970dc729ff611c0bc99ab38b9591f93ff3de1fa8',
};

test.beforeEach(async ({ page }) => {
  await page.goto(DOC_URL);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
});

test('SHA-256 of every stored version is unchanged', async ({ page }) => {
  const hashes = await page.evaluate(async () => {
    const out = {};
    for (const v of EDoc.versionOrder()) out[v] = await EDoc.ensureHash(v);
    return out;
  });
  expect(hashes).toEqual(HASHES);
});

test('formal diff, summary and sanitizer output are byte-identical to the golden files', async ({ page }) => {
  const results = await page.evaluate(() => {
    const V = EDoc.versions;
    const base = V['v0.7'].html;
    const draft = () => {
      const w = document.createElement('div');
      w.innerHTML = EDoc.cleanSnapshot(base);
      EDoc.annotateBaseBlocks(w);
      return w;
    };
    const li = (w, text) =>
      [...w.querySelectorAll('li')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)));
    const edits = {
      'delete-2-chars': (w) => { const t = li(w, '並持續追蹤').firstChild; t.textContent = t.textContent.replace('並持續追蹤', '並追蹤'); },
      'insert-2-chars': (w) => { const t = li(w, '並持續追蹤').firstChild; t.textContent = t.textContent.replace('並持續追蹤', '並持續嚴謹追蹤'); },
      'rewrite-phrase': (w) => { const t = li(w, '盡可能縮小').firstChild; t.textContent = t.textContent.replace('盡可能縮小問題範圍', '快速釐清根因'); },
      'add-item-cloned-id': (w) => { const a = li(w, '等角色有效合作'); const c = a.cloneNode(false); c.textContent = '具備良好的時間管理能力。'; a.after(c); },
      'delete-item': (w) => li(w, '能閱讀基本 API').remove(),
      'empty-tombstone': (w) => { const a = li(w, '能閱讀基本 API'); const t = a.cloneNode(false); t.className = 'deletion-record'; a.replaceWith(t); },
      'style-wrapper': (w) => { const a = li(w, '並持續追蹤'); a.innerHTML = a.innerHTML.replace('並持續追蹤', '<span style="color: rgb(74, 163, 255);">並持續追蹤</span>'); },
      'nested-edit': (w) => { const a = li(w, 'Payload'); a.firstChild.textContent = 'Payload / Header'; },
      'div-paragraph-after-heading': (w) => { const h = [...w.querySelectorAll('h2')].find((x) => x.textContent.includes('加分項目')); const d = document.createElement('div'); d.textContent = '以下條件非必要。'; h.after(d); },
      'merge-items': (w) => { const a = li(w, '具實際運用生成式 AI'); const b = li(w, '具良好的跨職能溝通能力'); a.append(...b.childNodes); b.remove(); },
      'split-item': (w) => { const a = li(w, '並持續追蹤'); const t = a.firstChild; const c = a.cloneNode(false); c.textContent = t.textContent.slice(20); t.textContent = t.textContent.slice(0, 20); a.after(c); },
      'delete-across-strong': (w) => { const s = [...w.querySelectorAll('strong')].find((x) => x.textContent === 'Test Case Design'); s.textContent = 'Test Case '; s.nextSibling.textContent = s.nextSibling.textContent.replace(' 能力', ''); },
      'reorder-sections': (w) => { const hs = [...w.children]; const i = hs.findIndex((x) => x.textContent.includes('加分項目')); w.prepend(...hs.slice(i - 1)); },
    };
    const out = {};
    for (const [name, edit] of Object.entries(edits)) {
      const w = draft();
      edit(w);
      const html = EDoc.buildFormalDiff(base, w.innerHTML);
      out[name] = { summary: EDoc.analyzeFormalDiff(html).summary, html };
    }
    const keys = EDoc.versionOrder();
    for (let i = 1; i < keys.length; i++) {
      const html = EDoc.buildFormalDiff(V[keys[i - 1]].html, EDoc.cleanSnapshot(V[keys[i]].html));
      out['history ' + keys[i - 1] + '→' + keys[i]] = { summary: EDoc.analyzeFormalDiff(html).summary, html };
    }
    out.sanitize = EDoc.sanitizeRevisionHtml(
      '<h2 id="x" onclick="a()">標題</h2><div>段落<b style="color:red">粗</b></div><script>x()</script>' +
      '<ul><li data-edoc-block="b1" class="changed">項目<a href=" javascript:x()">連結</a><img src="data:x" alt="圖"></li></ul>' +
      '<svg><a href="#">svg</a></svg><font color="red">字</font><!-- note -->',
    );
    return out;
  });
  expect(JSON.stringify(results, null, 2)).toMatchSnapshot('engine-output.json');
});
