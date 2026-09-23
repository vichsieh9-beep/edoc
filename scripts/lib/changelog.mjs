// Phase 4 tooling: give an AI the change list of a version, then validate and store its summary.
// The change list is computed in the built document page, i.e. by the same engine as the site.
import { chromium } from '@playwright/test';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './site.mjs';
import { aiSummaryErrors, AI_SUMMARY_MAX, AI_PLACEHOLDER_PREFIX } from '../../src/engine/ai-summary.js';

export async function readVersionFacts(slug, versions) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(join(ROOT, 'documents', slug, 'index.html')).href);
    await page.waitForFunction(() => window.EDoc && Object.values(EDoc.versions).every((v) => v.hash));
    return await page.evaluate(([versions, placeholder]) => versions.map((v) => {
      const data = EDoc.versions[v];
      if (!data) return { version: v, missing: true };
      return {
        version: v,
        previous: data.previous,
        summary: data.summary,
        hash: data.hash,
        changes: EDoc.listChanges(data.html),
        hasAiSummary: !!data.aiSummary,
        machineSummary: data.details.some((d) => d.startsWith(placeholder)),
      };
    }), [versions, AI_PLACEHOLDER_PREFIX]);
  } finally {
    await browser.close();
  }
}

const TYPE = { modified: '修改', added: '新增', deleted: '刪除' };

export function formatPacket(doc, facts) {
  const lines = [
    `EDoc AI 語意摘要｜${doc.title} ${facts.version}（比較基準 ${facts.previous ?? '無'}）`,
    `系統統計：${facts.summary}`,
    `內容雜湊：${facts.hash}`,
    '',
    '變更清單',
  ];
  facts.changes.forEach((c, i) => {
    lines.push(`${i + 1}. ${c.section}｜${TYPE[c.type]}`);
    if (c.before !== undefined) lines.push(`   前：${c.before}`);
    if (c.after !== undefined) lines.push(`   後：${c.after}`);
  });
  if (!facts.changes.length) lines.push('（沒有內容變更）');
  lines.push(
    '',
    '寫法規則',
    `- summary：一句繁體中文，不超過 ${AI_SUMMARY_MAX} 字，說明這一版改了什麼。`,
    '- details：每個語意變更一條，以「章節名：」開頭；同一方向的變更可以合併。',
    '- 只描述文件改了什麼，可以歸納方向；不替作者編理由，不寫變更清單裡沒有的內容。',
    '- model：填你自己的模型 ID。generatedAt 與 contentHash 由工具自動填。',
    '',
    `寫回：把下面的 JSON 存成檔案後執行  npm run changelog -- ${facts.version} --apply <檔案>`,
    JSON.stringify({ summary: '', details: [''], model: '' }, null, 2),
  );
  return lines.join('\n');
}

/** Return a copy of doc with the validated AI summary attached to `version`. */
export function applyAiSummary(doc, version, input, { hash, force = false, now = new Date() }) {
  const current = doc.versions[version];
  if (!current) throw new Error(`找不到版本 ${version}`);
  if (current.aiSummary && !force) throw new Error(`${version} 已經有 AI 摘要；要重寫請加 --force`);
  if (input.contentHash && input.contentHash !== hash) throw new Error(`這份摘要是寫給另一個內容（contentHash 不符），拒絕寫入`);
  const ai = {
    summary: typeof input.summary === 'string' ? input.summary.trim() : input.summary,
    details: Array.isArray(input.details) ? input.details.map((d) => (typeof d === 'string' ? d.trim() : d)) : input.details,
    model: typeof input.model === 'string' ? input.model.trim() : input.model,
    generatedAt: now.toISOString(),
    contentHash: hash,
  };
  const errors = aiSummaryErrors(ai, hash);
  if (errors.length) throw new Error('AI 摘要不合格：\n- ' + errors.join('\n- '));
  return { ...doc, versions: { ...doc.versions, [version]: { ...current, aiSummary: ai } } };
}
