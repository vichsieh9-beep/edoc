// Engine-level contract tests for the formal diff (CLAUDE.md "Critical diff invariant"):
// the formal version diff is computed from Base Version Snapshot vs Draft Snapshot only —
// transient draft markers (block ids, tombstones, MutationObserver flags) must not change the result.
import { test, expect } from '@playwright/test';
import { DOC_URL } from './helpers.js';

const L_API = '能閱讀基本 API / JSON 資料結構，並利用相關資訊協助判斷前端、後端或第三方系統問題。';

test.beforeEach(async ({ page }) => {
  await page.goto(DOC_URL);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  await page.evaluate(() => {
    const strip = (s) => s.replace(/\s+/g, '');
    window.__t = {
      strip,
      // Draft DOM exactly as startRevision() prepares it: clean snapshot + block ids.
      draftOf(html) {
        const w = document.createElement('div');
        w.innerHTML = cleanSnapshot(html);
        annotateBaseBlocks(w);
        return w;
      },
      plainOf(html) {
        const w = document.createElement('div');
        w.innerHTML = cleanSnapshot(html);
        return w;
      },
      liWith(root, text) {
        const hits = [...root.querySelectorAll('li')].filter((li) =>
          [...li.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)),
        );
        if (hits.length !== 1) throw new Error('liWith ' + text + ': ' + hits.length);
        return hits[0];
      },
      textOf(html) {
        const w = document.createElement('div');
        w.innerHTML = cleanSnapshot(html);
        return strip(w.textContent);
      },
      // Classify formal-diff output by markup: .deleted wins over .changed.
      classify(html) {
        const w = document.createElement('div');
        w.innerHTML = html;
        const out = { blue: '', red: '', oldText: '', newText: '', styled: w.querySelectorAll('[style]').length };
        const tw = document.createTreeWalker(w, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = tw.nextNode())) {
          const t = strip(n.textContent);
          if (!t) continue;
          const deleted = !!n.parentElement.closest('.deleted');
          const added = !deleted && !!n.parentElement.closest('.changed');
          if (deleted) out.red += t;
          if (added) out.blue += t;
          if (!added) out.oldText += t;
          if (!deleted) out.newText += t;
        }
        return out;
      },
    };
  });
});

test('no edit → no marks, identical content', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = VERSION_DATA['v0.7'].html;
    const formal = buildFormalDiff(base, __t.draftOf(base).innerHTML);
    return { ...__t.classify(formal), same: cleanSnapshot(formal) === cleanSnapshot(base) };
  });
  expect(r.blue).toBe('');
  expect(r.red).toBe('');
  expect(r.same).toBe(true);
});

test('formal diff depends only on content, not on draft block ids', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = VERSION_DATA['v0.7'].html;
    const w = __t.plainOf(base); // no data-edoc-block ids at all
    const li = __t.liWith(w, '並持續追蹤');
    li.firstChild.textContent = li.firstChild.textContent.replace('並持續追蹤', '並追蹤');
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  });
  expect(r.red).toBe('持續');
  expect(r.blue).toBe('');
});

test('duplicated block id (browser clones attributes on Enter) → only the new item blue', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = VERSION_DATA['v0.7'].html;
    const w = __t.draftOf(base);
    const li = __t.liWith(w, '等角色有效合作');
    const clone = li.cloneNode(false); // keeps data-edoc-block, like Chrome's insertParagraph
    clone.textContent = '具備良好的時間管理能力。';
    li.after(clone);
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  });
  expect(r.red).toBe('');
  expect(r.blue).toBe('具備良好的時間管理能力。');
});

test('block removed without a tombstone → still shown as red strikethrough', async ({ page }) => {
  const r = await page.evaluate((L_API) => {
    const base = VERSION_DATA['v0.7'].html;
    const w = __t.draftOf(base);
    __t.liWith(w, L_API.slice(0, 12)).remove();
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  }, L_API);
  expect(r.red).toBe(L_API.replace(/\s+/g, ''));
  expect(r.blue).toBe('');
});

test('empty tombstone (text deleted before the block was removed) → deleted text still shown', async ({ page }) => {
  const r = await page.evaluate((L_API) => {
    const base = VERSION_DATA['v0.7'].html;
    const w = __t.draftOf(base);
    const li = __t.liWith(w, L_API.slice(0, 12));
    const tomb = li.cloneNode(false);
    tomb.classList.add('deletion-record');
    tomb.setAttribute('contenteditable', 'false');
    li.replaceWith(tomb);
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  }, L_API);
  expect(r.red).toBe(L_API.replace(/\s+/g, ''));
  expect(r.blue).toBe('');
});

test('inline style wrapper left by the browser is not a content change', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = VERSION_DATA['v0.7'].html;
    const w = __t.draftOf(base);
    const li = __t.liWith(w, '並持續追蹤');
    li.innerHTML = li.innerHTML.replace('並持續追蹤', '<span style="color: rgb(74, 163, 255);">並持續追蹤</span>');
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  });
  expect(r.blue).toBe('');
  expect(r.red).toBe('');
  expect(r.styled).toBe(0);
});

test('table cell edit → only that cell changes', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = '<table><tbody><tr><th>項目</th><th>說明</th></tr><tr><td>甲乙丙</td><td>丁戊</td></tr></tbody></table>';
    const w = __t.draftOf(base);
    w.querySelector('td').textContent = '甲丙';
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  });
  expect(r.red).toBe('乙');
  expect(r.blue).toBe('');
});

test('heading reorder → moved section is visible and both versions are preserved', async ({ page }) => {
  const r = await page.evaluate(() => {
    const base = '<h2>A段</h2><ul><li>一</li></ul><h2>B段</h2><ul><li>二</li></ul>';
    const w = __t.draftOf(base);
    const [h2a, ula, h2b, ulb] = [...w.children];
    w.prepend(h2b, ulb); // ids travel with the moved nodes, as in a real cut/paste
    return __t.classify(buildFormalDiff(base, w.innerHTML));
  });
  expect(r.oldText).toBe('A段一B段二');
  expect(r.newText).toBe('B段二A段一');
  expect(r.red).not.toBe('');
  expect(r.blue).not.toBe('');
});

test('stored history: recomputing every vN vs vN-1 is a faithful merge of both versions', async ({ page }) => {
  const results = await page.evaluate(() => {
    const keys = versionOrder();
    const out = [];
    for (let i = 1; i < keys.length; i++) {
      const prev = VERSION_DATA[keys[i - 1]].html;
      const cur = VERSION_DATA[keys[i]].html;
      const c = __t.classify(buildFormalDiff(prev, cleanSnapshot(cur)));
      out.push({
        pair: keys[i - 1] + '→' + keys[i],
        oldOk: c.oldText === __t.textOf(prev),
        newOk: c.newText === __t.textOf(cur),
        blueRatio: +(c.blue.length / Math.max(1, c.newText.length)).toFixed(2),
      });
    }
    return out;
  });
  for (const r of results) {
    expect.soft(r.oldOk, `${r.pair} old text preserved`).toBe(true);
    expect.soft(r.newOk, `${r.pair} new text preserved`).toBe(true);
    expect.soft(r.blueRatio, `${r.pair} not mostly blue`).toBeLessThan(0.5);
  }
});
