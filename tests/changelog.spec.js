// Phase 4 tooling: the change list an AI reads, and validation of what it writes back.
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applyAiSummary, formatPacket, readVersionFacts } from '../scripts/lib/changelog.mjs';
import { ROOT } from '../scripts/lib/site.mjs';
import { DOC_URL } from './helpers.js';

const HASH = 'a'.repeat(64);
const doc = () => ({ title: '測試文件', versions: { 'v0.8': { summary: 's', details: [], html: '', previous: 'v0.7' } } });
const good = { summary: '補強問題重現與回歸確認責任。', details: ['職務簡述：追蹤問題延伸到重現與回歸確認。'], model: 'claude-test' };

test('listChanges reports modified, added and deleted items by section', async ({ page }) => {
  await page.goto(DOC_URL);
  await expect(page.locator('#versionHash')).toHaveText(/SHA-256：[0-9a-f]{64}/);
  const changes = await page.evaluate(() => {
    const base = EDoc.versions['v0.7'].html;
    const w = document.createElement('div');
    w.innerHTML = EDoc.cleanSnapshot(base);
    const li = (text) => [...w.querySelectorAll('li')].find((x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(text)));
    const t = li('並持續追蹤').firstChild;
    t.textContent = t.textContent.replace('驗證完成。', '驗證完成，必要時協助重現與回歸確認。');
    const live = li('具 Live Game');
    const added = live.cloneNode(false); added.textContent = '具 RNG／機率與派彩數值驗證經驗。'; live.after(added);
    li('了解 Git 基本概念').remove();
    return EDoc.listChanges(EDoc.buildFormalDiff(base, w.innerHTML));
  });
  expect(changes).toEqual([
    {
      section: '職務簡述', type: 'modified',
      before: '執行功能測試、整合測試、回歸測試、跨裝置／瀏覽器測試，並持續追蹤問題直到驗證完成。',
      after: '執行功能測試、整合測試、回歸測試、跨裝置／瀏覽器測試，並持續追蹤問題直到驗證完成，必要時協助重現與回歸確認。',
    },
    { section: '加分項目', type: 'added', after: '具 RNG／機率與派彩數值驗證經驗。' },
    { section: '加分項目', type: 'deleted', before: '了解 Git 基本概念與操作。' },
  ]);
});

test('packet shows the change list, the writing rules and the apply command', () => {
  const text = formatPacket(doc(), {
    version: 'v0.8', previous: 'v0.7', summary: '職務簡述 1 處修改', hash: HASH,
    changes: [{ section: '職務簡述', type: 'modified', before: '甲', after: '甲乙' }],
  });
  expect(text).toContain('1. 職務簡述｜修改\n   前：甲\n   後：甲乙');
  expect(text).toContain('不替作者編理由');
  expect(text).toContain('npm run changelog -- v0.8 --apply <檔案>');
  expect(text).toContain(HASH);
});

test('applyAiSummary fills hash and time, and rejects bad or conflicting summaries', () => {
  const now = new Date('2026-09-23T07:30:00Z');
  const out = applyAiSummary(doc(), 'v0.8', { ...good, summary: '  ' + good.summary + ' ' }, { hash: HASH, now });
  expect(out.versions['v0.8'].aiSummary).toEqual({ ...good, generatedAt: now.toISOString(), contentHash: HASH });
  expect(out.versions['v0.8'].html).toBe('');

  const reject = (input, pattern, opts = {}) => expect(() => applyAiSummary(doc(), 'v0.8', input, { hash: HASH, ...opts })).toThrow(pattern);
  reject({ ...good, summary: '字'.repeat(61) }, /summary 超過 60 字/);
  reject({ ...good, details: ['沒有章節名的說明'] }, /要以「章節名：」開頭/);
  reject({ ...good, details: [] }, /details 至少要一條/);
  reject({ ...good, model: '' }, /model 不可空白/);
  reject({ ...good, contentHash: 'b'.repeat(64) }, /contentHash 不符/);
  expect(() => applyAiSummary(doc(), 'v0.9', good, { hash: HASH })).toThrow(/找不到版本 v0.9/);

  expect(() => applyAiSummary(out, 'v0.8', good, { hash: HASH })).toThrow(/已經有 AI 摘要；要重寫請加 --force/);
  const replaced = applyAiSummary(out, 'v0.8', { ...good, summary: '重寫的摘要。' }, { hash: HASH, force: true });
  expect(replaced.versions['v0.8'].aiSummary.summary).toBe('重寫的摘要。');
});

test('stored versions v0.1–v0.7 need no AI summary (their summaries are human-written)', async () => {
  const source = JSON.parse(await readFile(join(ROOT, 'documents/qa-senior-game-qa/document.json'), 'utf8'));
  const facts = await readVersionFacts('qa-senior-game-qa', Object.keys(source.versions));
  expect(facts.map((f) => f.machineSummary)).toEqual(facts.map(() => false));
  expect(facts.every((f) => /^[0-9a-f]{64}$/.test(f.hash))).toBe(true);
});
