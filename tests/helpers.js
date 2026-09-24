import { test, expect } from '@playwright/test';
import { enablePublishing, PUBLISH_API } from './publish-mock.js';
import { TEST_TOKEN, TEST_NAME } from './fake-github.js';

export { TEST_TOKEN, TEST_NAME };

// Relative to baseURL so the tests also run against the live site under /edoc/.
export const DOC_URL = 'documents/qa-senior-game-qa/';

// Colors from the document's CSS variables (--changed / --deleted / --text).
const BLUE = 'rgb(29, 78, 216)';
const RED = 'rgb(185, 28, 28)';
const PLAIN = 'rgb(31, 31, 31)';

/**
 * Open the QA document on v0.7 and wait until hashes are computed.
 * With edit (default) the page is opened through an edit link and publishing goes to the
 * real Worker code backed by a fake GitHub (dialogs.gh). Returns collected dialog messages.
 */
export async function openDoc(page, { edit = true, gh } = {}) {
  if (edit) test.skip(!PUBLISH_API, 'no publish API configured for this site');
  const dialogs = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await page.addInitScript(() => { window.__EDOC_POLL_MS = 100; });
  dialogs.gh = edit ? await enablePublishing(page, { gh }) : null;
  await page.goto(DOC_URL + (edit ? `#edit=${TEST_TOKEN}` : ''));
  await expect(page.locator('#versionLabel')).toHaveText('v0.7 · Current');
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  if (edit) await expect(page.locator('#whoChip')).toHaveText('可編輯・' + TEST_NAME);
  return dialogs;
}

export async function startRevision(page) {
  await page.locator('#newRevisionBtn').click();
  await expect(page.locator('#doc')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('#versionLabel')).toHaveText(/^Draft · Base v\d+\.\d+$/);
}

/** 完成修訂-版本更新 → 發布, then wait until the page shows the new version. */
export async function acceptRevision(page, expectedVersion) {
  await page.locator('#finishRevisionBtn').click();
  await page.locator('#dialogActions button.primary').click();
  await expect(page.locator('#versionLabel')).toHaveText(`${expectedVersion} · Current`);
}

export async function openVersion(page, version) {
  await page.locator('#versionButton').click();
  await page.locator('#versionMenu .version-item', { hasText: new RegExp(`^${version.replace('.', '\\.')}`) }).click();
  await expect(page.locator('#cardTitle')).toHaveText(`${version}｜版本摘要`);
}

// Runs in the page: find the single text node inside #doc that contains `needle`.
const FIND_TEXT = `(needle) => {
  const doc = document.getElementById('doc');
  const hits = [];
  const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    if (n.parentElement.closest('.deletion-record')) continue;
    let i = n.textContent.indexOf(needle);
    while (i >= 0) { hits.push([n, i]); i = n.textContent.indexOf(needle, i + 1); }
  }
  if (hits.length !== 1) throw new Error('expected exactly one match for ' + JSON.stringify(needle) + ', got ' + hits.length);
  return hits[0];
}`;

/** Collapse the caret at the start or end of `needle` (must be unique and inside one text node). */
export async function placeCaret(page, needle, at = 'end') {
  await page.evaluate(
    ([findSrc, needle, at]) => {
      const find = eval(findSrc);
      const [node, i] = find(needle);
      document.getElementById('doc').focus();
      const r = document.createRange();
      r.setStart(node, at === 'start' ? i : i + needle.length);
      r.collapse(true);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    },
    [FIND_TEXT, needle, at],
  );
}

/**
 * Select from `fromNeedle` to the end of `toNeedle`; both must be unique.
 * `fromAt` is 'start', 'end', or a character offset inside `fromNeedle`.
 */
export async function selectBetween(page, fromNeedle, toNeedle, fromAt = 'start') {
  await page.evaluate(
    ([findSrc, fromNeedle, toNeedle, fromAt]) => {
      const find = eval(findSrc);
      const [a, i] = find(fromNeedle);
      const [b, j] = find(toNeedle);
      document.getElementById('doc').focus();
      const r = document.createRange();
      r.setStart(a, i + (fromAt === 'start' ? 0 : fromAt === 'end' ? fromNeedle.length : fromAt));
      r.setEnd(b, j + toNeedle.length);
      const s = getSelection();
      s.removeAllRanges();
      s.addRange(r);
    },
    [FIND_TEXT, fromNeedle, toNeedle, fromAt],
  );
}

export async function selectText(page, needle) {
  await selectBetween(page, needle, needle);
}

/**
 * Classify every visible character in #doc by its rendered color.
 * - blue / red: concatenated text rendered as added / deleted
 * - oldText: everything that is not blue (what the previous version said)
 * - newText: everything that is not red (what this version says)
 * - otherColors: any color other than the text color/blue/red (e.g. leaked inline styles)
 * Whitespace is stripped so comparisons are about content, not formatting.
 */
export async function renderedDiff(page) {
  return page.evaluate(
    ([BLUE, RED, PLAIN]) => {
      const doc = document.getElementById('doc');
      const out = { blue: '', red: '', oldText: '', newText: '', otherColors: [] };
      const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const t = n.textContent.replace(/\s+/g, '');
        if (!t) continue;
        const el = n.parentElement;
        if (!el.checkVisibility()) continue;
        const color = getComputedStyle(el).color;
        if (color === BLUE) out.blue += t;
        else if (color === RED) out.red += t;
        else if (color !== PLAIN) out.otherColors.push(color);
        if (color !== BLUE) out.oldText += t;
        if (color !== RED) out.newText += t;
      }
      return out;
    },
    [BLUE, RED, PLAIN],
  );
}

/** Whitespace-stripped visible text of #doc (used as the baseline before editing). */
export async function docText(page) {
  return page.evaluate(() => document.getElementById('doc').innerText.replace(/\s+/g, ''));
}

export const strip = (s) => s.replace(/\s+/g, '');

/** Assert the rendered diff is exactly `blue`/`red`, and is a faithful merge of `before` and `after`. */
export async function expectDiff(page, { blue, red, before, after }) {
  const d = await renderedDiff(page);
  expect.soft(d.otherColors, 'no stray colors (e.g. inline styles)').toEqual([]);
  expect.soft(d.oldText, 'non-blue text must equal the previous version').toBe(strip(before));
  expect.soft(d.newText, 'non-red text must equal the new version').toBe(strip(after));
  expect(d.red, 'deleted (red) text').toBe(strip(red));
  expect(d.blue, 'added (blue) text').toBe(strip(blue));
}

export async function versionKeys(page) {
  return page.evaluate(() => EDoc.versionOrder());
}
