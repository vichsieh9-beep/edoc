// Regression tests for EDOC_HANDOFF.md §11 "P0: Diff correctness".
// Every edit is made with real keyboard input in the contenteditable Draft,
// then the formal version is created with 「建立新版本」 and its rendering is checked.
import { test, expect } from '@playwright/test';
import {
  openDoc, startRevision, acceptRevision, openVersion, placeCaret, selectText, selectBetween,
  renderedDiff, docText, expectDiff, versionKeys, strip,
} from './helpers.js';

const L_TRACK = '執行功能測試、整合測試、回歸測試、跨裝置／瀏覽器測試，並持續追蹤問題直到驗證完成。';
const L_LOG = '利用 Log、Browser DevTools、API Request / Response 等資訊進行初步問題定位，盡可能縮小問題範圍並提供 RD 有效資訊。';
const L_TEAM = '具良好的跨職能溝通能力，能與 PM、RD、Game Designer 等角色有效合作。';
const L_API = '能閱讀基本 API / JSON 資料結構，並利用相關資訊協助判斷前端、後端或第三方系統問題。';

test.describe('P0 diff correctness', () => {
  test('handoff §14: delete 2 CJK chars → only those 2 chars red, rest white', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '並持續', 'end');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '持續', blue: '', before, after: before.replace('並持續追蹤', '並追蹤') });
    await expect(page.locator('#cardSummary')).toHaveText('職務簡述 1 處修改');
  });

  test('case 2: add 2 chars → only the new chars blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '並持續', 'end');
    await page.keyboard.type('嚴謹');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '', blue: '嚴謹', before, after: before.replace('並持續追蹤', '並持續嚴謹追蹤') });
  });

  test('case 3: rewrite part of a sentence → document does not turn blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await selectText(page, '盡可能縮小問題範圍');
    await page.keyboard.type('快速釐清根因');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, {
      red: '盡可能縮小問題範圍',
      blue: '快速釐清根因',
      before,
      after: before.replace('盡可能縮小問題範圍', '快速釐清根因'),
    });
  });

  test('case 4: editing one list item leaves every other item untouched', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await selectText(page, '有效合作');
    await page.keyboard.type('順暢合作');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '有效', blue: '順暢', before, after: before.replace('有效合作', '順暢合作') });
    const owners = await page.evaluate(() =>
      [...document.querySelectorAll('#doc .changed, #doc .deleted')].map((el) => el.closest('li')?.textContent ?? ''),
    );
    expect(owners.length).toBeGreaterThan(0);
    for (const t of owners) expect(t).toContain('跨職能溝通能力');
  });

  test('case 5: add a whole list item → only the new item blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '等角色有效合作。', 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.type('具備良好的時間管理能力。');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, {
      red: '',
      blue: '具備良好的時間管理能力。',
      before,
      after: before.replace(strip(L_TEAM), strip(L_TEAM) + '具備良好的時間管理能力。'),
    });
    await expect(page.locator('#cardSummary')).toHaveText('需求條件 1 處新增');
  });

  test('case 6a: delete a whole list item (select text, Backspace ×2) → item red strikethrough', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await selectText(page, L_API);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: L_API, blue: '', before, after: before.replace(strip(L_API), '') });
    await expect(page.locator('#cardSummary')).toHaveText('需求條件 1 處刪除');
  });

  test('case 6b: delete a whole list item (select from end of previous item) → item red strikethrough', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    // The item before L_API ends with the nested DevTools list, whose last entry is "Storage".
    await selectBetween(page, 'Storage', L_API, 'end');
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: L_API, blue: '', before, after: before.replace(strip(L_API), '') });
  });

  test('case 7 + 8: previous blue returns to white; history keeps its own diff', async ({ page }) => {
    await openDoc(page);
    const v07 = await docText(page);

    await startRevision(page);
    await placeCaret(page, '並持續', 'end');
    await page.keyboard.type('嚴謹');
    await acceptRevision(page, 'v0.8');
    const v08 = v07.replace('並持續追蹤', '並持續嚴謹追蹤');

    await startRevision(page);
    await placeCaret(page, '進行初步', 'end');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.9');
    const v09 = v08.replace('進行初步問題定位', '進行問題定位');

    // case 7: v0.9 shows only v0.9 vs v0.8 — "嚴謹" is back to white.
    await expectDiff(page, { red: '初步', blue: '', before: v08, after: v09 });
    await expect(page.locator('#compareBadge')).toHaveText('比較基準：v0.8');

    // case 8: v0.8 still shows v0.8 vs v0.7.
    await openVersion(page, 'v0.8');
    await expectDiff(page, { red: '', blue: '嚴謹', before: v07, after: v08 });
    await expect(page.locator('#statusBadge')).toHaveText('歷史版・唯讀');
    await expect(page.locator('#doc')).toHaveAttribute('contenteditable', 'false');

    await openVersion(page, 'v0.9');
    await expectDiff(page, { red: '初步', blue: '', before: v08, after: v09 });
  });

  test('case 9: loading / switching versions never counts as an edit', async ({ page }) => {
    const dialogs = await openDoc(page);
    for (const v of ['v0.1', 'v0.4', 'v0.6', 'v0.2', 'v0.7']) await openVersion(page, v);
    await startRevision(page);

    const leftovers = await page.evaluate(
      () => document.querySelectorAll('#doc .revision-changed, #doc .deletion-record, #doc .changed, #doc .deleted').length,
    );
    expect(leftovers).toBe(0);
    await expect(page.locator('#revisionSummary')).toHaveText('未偵測到內容變更');

    await page.locator('#finishRevisionBtn').click();
    await expect.poll(() => dialogs.at(-1)).toBe('沒有偵測到內容變更，因此不建立新版本。');
    expect((await versionKeys(page)).at(-1)).toBe('v0.7');
  });

  test('case 9b: switching versions does not mutate stored snapshots', async ({ page }) => {
    await openDoc(page);
    const snapshot = await page.evaluate(() => JSON.stringify(Object.values(EDoc.versions).map((v) => [v.html, v.hash])));
    for (const v of ['v0.1', 'v0.3', 'v0.5', 'v0.7', 'v0.2']) await openVersion(page, v);
    await startRevision(page);
    await openVersion(page, 'v0.6');
    const after = await page.evaluate(() => JSON.stringify(Object.values(EDoc.versions).map((v) => [v.html, v.hash])));
    expect(after).toBe(snapshot);
  });
});

test.describe('P0 DOM diff boundaries', () => {
  test('edit inside <strong> → only typed text blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, 'Test Case Design', 'end');
    await page.keyboard.type(' 與 Review');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '', blue: '與Review', before, after: before.replace('TestCaseDesign能力', 'TestCaseDesign與Review能力') });
  });

  test('delete across a <strong> boundary → only deleted chars red', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await selectBetween(page, 'Test Case Design', ' 能力', 'Test Case '.length);
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: 'Design能力', blue: '', before, after: before.replace('TestCaseDesign能力，能從', 'TestCase，能從') });
  });

  test('edit a nested list item → only that item changes, counted once', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, 'Payload', 'end');
    await page.keyboard.type(' / Header');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '', blue: '/Header', before, after: before.replace('Payload', 'Payload/Header') });
    await expect(page.locator('#cardSummary')).toHaveText('需求條件 1 處修改');
  });

  test('Enter after a heading, type a paragraph → paragraph blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '【加分項目】', 'end');
    await page.keyboard.press('Enter');
    await page.keyboard.type('以下條件非必要。');
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, { red: '', blue: '以下條件非必要。', before, after: before.replace('【加分項目】', '【加分項目】以下條件非必要。') });
  });

  test('merge two list items with Backspace → text unchanged, nothing else marked', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '具良好的跨職能溝通能力', 'start');
    await page.keyboard.press('Backspace');
    await acceptRevision(page, 'v0.8');

    const d = await renderedDiff(page);
    expect(d.otherColors).toEqual([]);
    expect(d.oldText).toBe(before);
    expect(d.newText).toBe(before);
    expect(d.blue).toBe(d.red);
    expect(strip(L_TEAM)).toContain(d.blue);
  });

  test('paste two list items → only pasted items blue', async ({ page }) => {
    await openDoc(page);
    const before = await docText(page);
    await startRevision(page);
    await placeCaret(page, '等角色有效合作。', 'end');
    await page.evaluate(() => document.execCommand('insertHTML', false, '<li>貼上項目甲。</li><li>貼上項目乙。</li>'));
    await acceptRevision(page, 'v0.8');

    await expectDiff(page, {
      red: '',
      blue: '貼上項目甲。貼上項目乙。',
      before,
      after: before.replace(strip(L_TEAM), strip(L_TEAM) + '貼上項目甲。貼上項目乙。'),
    });
  });
});
