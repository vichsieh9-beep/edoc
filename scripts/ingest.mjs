// npm run ingest -- <exported review .html>
// Adds versions created in the browser to documents/<slug>/document.json, then rebuilds the site.
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { ingestReviewHtml, reviewDocumentId } from './lib/ingest.mjs';
import { buildSite, loadDocuments, ROOT } from './lib/site.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run ingest -- <exported review .html>');
  process.exit(1);
}
try {
  const html = await readFile(file, 'utf8');
  const documentId = reviewDocumentId(html);
  const entry = (await loadDocuments()).find(({ doc }) => doc.documentId === documentId);
  if (!entry) throw new Error(`找不到 documentId 為 ${documentId} 的文件`);

  const { doc, added, pendingRevisions } = ingestReviewHtml(entry.doc, html);
  if (!added.length) {
    console.log(`沒有新版本；${relative(ROOT, entry.file)} 未變更。`);
  } else {
    await writeFile(entry.file, JSON.stringify(doc, null, 2) + '\n');
    for (const v of added) console.log(`+ ${v}｜${doc.versions[v].summary}`);
    const { changed } = await buildSite();
    console.log(`已寫入 ${relative(ROOT, entry.file)}，重新產生：${changed.join(', ') || '（無）'}`);
    console.log(`提醒：${added.join('、')} 還沒有 AI 語意摘要。在 CC／Codex 對話中說「補 ${added.at(-1)} 摘要」，或執行 npm run changelog -- ${added.at(-1)}。`);
  }
  if (pendingRevisions) console.log(`注意：檔案內有 ${pendingRevisions} 筆尚未接受的修訂，不會寫入正本。`);
} catch (e) {
  console.error('匯入失敗：' + e.message);
  process.exit(1);
}
