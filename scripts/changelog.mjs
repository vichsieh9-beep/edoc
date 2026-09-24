// Phase 4 — AI semantic summaries (G1: written by an AI in a Claude Code / Codex session).
//   npm run changelog                                  list versions still waiting for an AI summary
//   npm run changelog -- v0.8                          print the change list and writing rules for the AI
//   npm run changelog -- v0.8 --apply summary.json     validate, write into document.json, rebuild
// Options: --doc <slug> (needed when there is more than one document), --force (replace an existing summary)
import { readFile, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import { buildSite, loadDocuments, ROOT } from './lib/site.mjs';
import { readVersionFacts, formatPacket, applyAiSummary } from './lib/changelog.mjs';
import { ensureUpToDate } from './lib/git.mjs';

const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const version = args.find((a) => /^v\d+\.\d+$/.test(a));
const applyFile = option('--apply');
const force = args.includes('--force');

try {
  await buildSite(); // make sure the built pages reflect document.json
  const entries = await loadDocuments();
  const slug = option('--doc');

  if (!version) {
    let pending = 0;
    for (const entry of entries.filter((e) => !e.doc.unlisted)) {
      const keys = Object.keys(entry.doc.versions);
      const facts = await readVersionFacts(entry.slug, keys);
      for (const f of facts.filter((f) => f.machineSummary && !f.hasAiSummary)) {
        pending++;
        console.log(`${entry.slug} ${f.version}｜${f.summary}`);
      }
    }
    console.log(pending ? `共 ${pending} 個版本還沒有 AI 語意摘要。` : '所有由系統產生摘要的版本都已有 AI 語意摘要。');
    process.exit(0);
  }

  const listed = entries.filter((e) => !e.doc.unlisted);
  const entry = slug ? entries.find((e) => e.slug === slug) : listed.length === 1 ? listed[0] : null;
  if (!entry) throw new Error(slug ? `找不到文件 ${slug}` : '有多份文件，請用 --doc <slug> 指定');
  const [facts] = await readVersionFacts(entry.slug, [version]);
  if (facts.missing) throw new Error(`${entry.slug} 沒有版本 ${version}`);

  if (!applyFile) {
    console.log(formatPacket(entry.doc, facts));
    process.exit(0);
  }
  ensureUpToDate(ROOT); // versions may have been published from the web since the last pull
  const input = JSON.parse(await readFile(applyFile, 'utf8'));
  const doc = applyAiSummary(entry.doc, version, input, { hash: facts.hash, force });
  await writeFile(entry.file, JSON.stringify(doc, null, 2) + '\n');
  const { changed } = await buildSite();
  console.log(`已寫入 ${version} 的 AI 語意摘要：${doc.versions[version].aiSummary.summary}`);
  console.log(`更新：${relative(ROOT, entry.file)}；重新產生：${changed.join(', ') || '（無）'}。確認畫面後再推上 GitHub。`);
} catch (e) {
  console.error('changelog 失敗：' + e.message);
  process.exit(1);
}
