// Manage edit links (who may publish new versions from the web page).
//   npm run edit-link -- new --name 客戶法務 [--doc <slug>|all]   create a link (shown once)
//   npm run edit-link -- list                                       list links
//   npm run edit-link -- revoke <id>                                disable a link
// Changes to edit-links.json take effect after they are pushed to GitHub.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLink, revokeLink, editUrl } from './lib/edit-links.mjs';
import { ensureUpToDate } from './lib/git.mjs';
import { ROOT, loadConfig, loadDocuments } from './lib/site.mjs';

const FILE = join(ROOT, 'edit-links.json');
const args = process.argv.slice(2);
const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

try {
  const registry = JSON.parse(await readFile(FILE, 'utf8'));
  const [command] = args;
  if (command === 'list') {
    if (!registry.links.length) console.log('目前沒有編輯連結。');
    for (const l of registry.links) {
      console.log(`${l.id}  ${l.name}  文件：${l.documents.join(', ')}  建立：${l.createdAt.slice(0, 10)}  ${l.revoked ? '已停用' : '有效'}`);
    }
  } else if (command === 'new') {
    ensureUpToDate(ROOT);
    const entries = await loadDocuments();
    const docArg = option('--doc');
    let documents;
    if (docArg === 'all') documents = ['*'];
    else if (docArg) {
      if (!entries.some((e) => e.slug === docArg)) throw new Error(`找不到文件 ${docArg}`);
      documents = [docArg];
    } else {
      const listed = entries.filter((e) => !e.doc.unlisted);
      if (listed.length !== 1) throw new Error('有多份文件，請用 --doc <slug> 或 --doc all 指定');
      documents = [listed[0].slug];
    }
    const { registry: next, link, token } = createLink(registry, { name: option('--name'), documents });
    await writeFile(FILE, JSON.stringify(next, null, 2) + '\n');
    const { siteUrl } = await loadConfig();
    const slugs = documents[0] === '*' ? entries.filter((e) => !e.doc.unlisted).map((e) => e.slug) : documents;
    console.log(`已建立編輯連結 ${link.id}（${link.name}）。這條連結只會顯示這一次，請直接用 LINE 傳給對方：\n`);
    for (const slug of slugs) console.log('  ' + editUrl(siteUrl, slug, token));
    console.log('\nedit-links.json 只存雜湊，不含連結本身；推上 GitHub 後連結才會生效。');
  } else if (command === 'revoke') {
    ensureUpToDate(ROOT);
    const next = revokeLink(registry, args[1]);
    await writeFile(FILE, JSON.stringify(next, null, 2) + '\n');
    console.log(`已停用 ${args[1]}；推上 GitHub 後生效，舊連結就不能再發布。`);
  } else {
    console.log('用法：npm run edit-link -- new --name <名字> [--doc <slug>|all]｜list｜revoke <id>');
    process.exit(command ? 1 : 0);
  }
} catch (e) {
  console.error('edit-link 失敗：' + e.message);
  process.exit(1);
}
