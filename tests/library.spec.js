// Library page: visitors browse and search; an admin link manages documents and edit links.
// Admin actions go to the real Worker code backed by a fake GitHub (tests/publish-mock.js).
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { enablePublishing, PUBLISH_API } from './publish-mock.js';
import { createFakeGithub, ADMIN_TOKEN, ADMIN_NAME, TEST_TOKEN, TEST_NAME } from './fake-github.js';
import { sampleDocx } from './docx-fixture.js';

const QA = 'qa-senior-game-qa';
const row = (page, text) => page.locator('#list .row', { hasText: text });

async function openLibrary(page, { gh = createFakeGithub(), token = ADMIN_TOKEN } = {}) {
  test.skip(!PUBLISH_API, 'no publish API configured for this site');
  await page.addInitScript(() => { window.__EDOC_POLL_MS = 100; });
  await enablePublishing(page, { gh });
  await page.goto(`./#edit=${token}`);
  if (token === ADMIN_TOKEN) await expect(page.locator('#who')).toHaveText('管理員・' + ADMIN_NAME);
  return gh;
}
const created = (gh) => gh.paths().filter((p) => /^documents\/d-[a-z0-9]{4}\/document\.json$/.test(p));

test('visitors see the listed documents with version and last update, can search, and get no admin controls', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.head h1')).toHaveText('EDoc 文件庫');
  const qa = row(page, '【QA】資深遊戲測試工程師');
  await expect(qa.locator('.ver')).toHaveText('v0.7');
  await expect(qa.locator('.upd')).toHaveText(/^更新 \d{2}\/\d{2}\/\d{2}/);
  await expect(qa.locator('a.name')).toHaveAttribute('href', `./documents/${QA}/`);
  await expect(page.locator('#list')).not.toContainText('EDoc 測試文件'); // unlisted sandbox
  await expect(page.locator('#newBtn')).toBeHidden();
  await expect(page.locator('#archToggle')).toBeHidden();
  await expect(page.locator('#list button')).toHaveCount(0);
  await page.locator('#search').fill('mini game');
  await expect(page.locator('#list .row')).toHaveCount(0);
  await expect(page.locator('#empty')).toHaveText('找不到符合的文件');
  await page.locator('#search').fill('qa engineer');
  await expect(page.locator('#list .row')).toHaveCount(1);
});

test('an admin link: token leaves the address bar, admin controls appear, document pages accept it too', async ({ page }) => {
  await openLibrary(page);
  expect(page.url()).not.toContain('edit=');
  expect(await page.evaluate(() => localStorage.getItem('edoc-edit:*'))).toBe(ADMIN_TOKEN);
  await expect(page.locator('#newBtn')).toBeVisible();
  await expect(page.locator('#archToggle')).toContainText('顯示已封存（0）');
  await expect(row(page, '資深遊戲測試工程師').locator('button')).toHaveText(['分享', '⋯']);
  await expect(page.locator('#visitorNote')).toBeHidden();
  await page.locator(`a.name[href="./documents/${QA}/"]`).click();
  await expect(page.locator('#whoChip')).toHaveText('可編輯・' + ADMIN_NAME);
  await expect(page.locator('#backLink')).toHaveAttribute('href', '../../');
});

test('an editor link opened on the library is not an admin: view only, token forgotten', async ({ page }) => {
  await openLibrary(page, { token: TEST_TOKEN });
  await expect(page.locator('#notice')).toContainText('不是管理員連結');
  await expect(page.locator('#newBtn')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('edoc-edit:*'))).toBeNull();
});

test('a blocked origin or an outage keeps the admin link: view only for now, try again later', async ({ page }) => {
  test.skip(!PUBLISH_API, 'no publish API configured for this site');
  await page.route((url) => url.href.startsWith(PUBLISH_API + '/'), (route) =>
    route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'origin', message: '不接受這個來源的請求' }) }));
  await page.goto(`./#edit=${ADMIN_TOKEN}`);
  await expect(page.locator('#notice')).toContainText('暫時連不上發布服務');
  expect(await page.evaluate(() => localStorage.getItem('edoc-edit:*'))).toBe(ADMIN_TOKEN);
  await expect(page.locator('#newBtn')).toBeHidden();
});

test('新增文件 · 空白: v0.1 holds only the title; the row waits for the site, then turns live', async ({ page }) => {
  const gh = await openLibrary(page);
  let live = false;
  await page.route(/\/documents\/d-[a-z0-9]{4}\/\?edoc-check=/, (route) =>
    live ? route.fulfill({ status: 200, contentType: 'text/html', body: '<script id="documentState" type="application/json">{}</script>' })
      : route.fulfill({ status: 404, body: '' }));
  await page.locator('#newBtn').click();
  await page.locator('#newName').fill('【GDD】Mini Game 規格書');
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const [path] = created(gh);
  const doc = gh.read(path);
  expect(doc.title).toBe('【GDD】Mini Game 規格書');
  expect(doc.versions['v0.1'].html).toBe('<h1>【GDD】Mini Game 規格書</h1>');
  expect(doc.versions['v0.1'].details).toContain('編輯者：' + ADMIN_NAME);
  const newRow = row(page, 'Mini Game 規格書');
  await expect(newRow.locator('.upd')).toHaveText('上線中，約 1～2 分鐘');
  live = true;
  await expect(newRow.locator('.upd')).toHaveText('✓ 已上線');
  await expect(newRow.locator('a.name')).toHaveAttribute('href', `./documents/${doc.documentId}/`);
  await expect(page.locator('#notice')).toContainText('已上線');
});

test('新增文件 · 複製: starts from the latest version without change marks', async ({ page }) => {
  const gh = await openLibrary(page);
  await row(page, '資深遊戲測試工程師').locator('[data-act="more"]').click();
  await page.locator('[data-menu="copy"]').click();
  await expect(page.locator('#newName')).toHaveValue('【QA】資深遊戲測試工程師（複本）');
  await expect(page.locator('.seg .on')).toHaveText('複製現有文件');
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const v01 = gh.read(created(gh)[0]).versions['v0.1'];
  expect(v01.summary).toBe('建立文件：複製現有文件（【QA】資深遊戲測試工程師 v0.7）');
  expect(v01.html.startsWith('<h1>【QA】資深遊戲測試工程師 (Senior Game QA Engineer)</h1>\n<h2>【職務簡述】</h2>')).toBe(true);
  expect(v01.html).not.toMatch(/class=|deletion-record|data-edoc-block/);
  const text = await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ''); }, v01.html);
  expect(text).toContain('利用Log、BrowserDevTools、APIRequest/Response');
});

test('新增文件 · 貼上文字: pasted html is cleaned and titled', async ({ page }) => {
  const gh = await openLibrary(page);
  await page.locator('#newBtn').click();
  await page.locator('#newName').fill('玩法說明');
  await page.locator('.seg [data-method="paste"]').click();
  await page.locator('#pasteBox').click();
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<h2 style="color:red">【玩法】</h2><ul><li>每局 <b>3</b> 回合</li></ul><script>window.__pwned=1</script>');
    document.getElementById('pasteBox').dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.locator('#pasteBox h2')).toHaveText('【玩法】');
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  expect(gh.read(created(gh)[0]).versions['v0.1'].html).toBe('<h1>玩法說明</h1>\n<h2>【玩法】</h2>\n<ul><li>每局 <b>3</b> 回合</li></ul>');
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
});

test('新增文件 · 貼上文字: nothing pasted is refused', async ({ page }) => {
  const gh = await openLibrary(page);
  await page.locator('#newBtn').click();
  await page.locator('#newName').fill('空的');
  await page.locator('.seg [data-method="paste"]').click();
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.modal .error')).toHaveText('請先貼上內容。');
  expect(created(gh)).toHaveLength(0);
});

test('新增文件 · 上傳 Word: converted in the browser, report and preview first, then v0.1', async ({ page }) => {
  const gh = await openLibrary(page);
  const uploads = [];
  page.on('request', (r) => { if (r.method() === 'POST') uploads.push(r.postData() || ''); });
  await page.locator('#newBtn').click();
  await page.locator('.seg [data-method="docx"]').click();
  await page.locator('#docxInput').setInputFiles({ name: 'Mini Game 規格書.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: sampleDocx() });
  await expect(page.locator('#docxReport')).toContainText('標題 3 個、段落 3 段、條列 5 項');
  await expect(page.locator('#docxReport .warn')).toHaveText([
    '表格 1 個：保留內容與合併儲存格，框線、底色改用 EDoc 樣式', '圖片 1 張：第一版不匯入', '文字方塊 1 個：未匯入',
    '頁首頁尾：未匯入', '註解 2 則：未匯入', '追蹤修訂 2 處：以目前顯示的文字匯入，修訂標記不保留',
  ]);
  await expect(page.locator('#docxPreview h2')).toHaveText('玩法說明');
  await expect(page.locator('#newName')).toHaveValue('Mini Game 規格書');
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  const v01 = gh.read(created(gh)[0]).versions['v0.1'];
  expect(v01.html.startsWith('<h1>Mini Game 規格書</h1>\n<h2>玩法說明</h2>')).toBe(true);
  expect(v01.details[0]).toBe('建立方式：上傳 Word（Mini Game 規格書.docx）');
  // Only the converted html left the browser, never the Word file itself.
  expect(uploads.some((b) => b.includes('word/document.xml') || b.includes('PK'))).toBe(false);
});

test('新增文件 · 上傳 Word: a non-.docx file is refused', async ({ page }) => {
  await openLibrary(page);
  await page.locator('#newBtn').click();
  await page.locator('.seg [data-method="docx"]').click();
  await page.locator('#docxInput').setInputFiles({ name: '舊檔.doc', mimeType: 'application/msword', buffer: Buffer.from('x') });
  await expect(page.locator('.modal .error')).toContainText('只支援 Word 的 .docx 檔');
});

test('改名 changes the name only', async ({ page }) => {
  const gh = await openLibrary(page);
  const before = gh.read();
  await row(page, '資深遊戲測試工程師').locator('[data-act="more"]').click();
  await page.locator('[data-menu="rename"]').click();
  await page.locator('#renameInput').fill('【QA】資深遊戲測試工程師（2027）');
  await page.locator('#renameInput').press('Enter');
  await expect(page.locator('.modal')).toHaveCount(0);
  expect(gh.read()).toEqual({ ...before, title: '【QA】資深遊戲測試工程師（2027）' });
  await expect(row(page, '（2027）')).toHaveCount(1);
  await expect(page.locator('#notice')).toContainText('公開網址約 1～2 分鐘後更新');
});

test('封存 asks first and hides the document; 還原 brings it back', async ({ page }) => {
  const gh = await openLibrary(page);
  await row(page, '資深遊戲測試工程師').locator('[data-act="more"]').click();
  await page.locator('[data-menu="archive"]').click();
  await expect(page.locator('.modal h3')).toHaveText('封存「【QA】資深遊戲測試工程師」？');
  await page.locator('[data-action="confirm"]').click();
  await expect(page.locator('#list .row')).toHaveCount(0);
  expect(gh.read().archived.by).toBe(ADMIN_NAME);
  await expect(page.locator('#archToggle')).toContainText('顯示已封存（1）');
  await page.locator('#archCheck').check();
  const archived = row(page, '資深遊戲測試工程師');
  await expect(archived).toHaveClass(/archived/);
  await expect(archived.locator('.tag-arch')).toHaveText('已封存');
  await expect(archived.locator('a.name')).toHaveCount(0);
  await archived.locator('[data-act="restore"]').click();
  await expect(row(page, '資深遊戲測試工程師')).not.toHaveClass(/archived/);
  expect(gh.read().archived).toBeUndefined();
});

test('分享: lists who may edit, a new link is shown once and stored as a hash, links can be revoked', async ({ page, context }) => {
  const gh = await openLibrary(page);
  await row(page, '資深遊戲測試工程師').locator('[data-act="share"]').click();
  await expect(page.locator('#linkList .l')).toHaveCount(1);
  await expect(page.locator('#linkList .l').first()).toContainText(TEST_NAME);
  await page.locator('#linkName').fill('HR Grace');
  await page.locator('#makeLink').click();
  const link = await page.locator('#onceLink').textContent();
  expect(link).toMatch(new RegExp(`/documents/${QA}/#edit=[A-Za-z0-9_-]{32}$`));
  const token = link.split('#edit=')[1];
  const entry = JSON.parse(gh.text('edit-links.json')).links.at(-1);
  expect(entry).toMatchObject({ name: 'HR Grace', documents: [QA], tokenHash: createHash('sha256').update(token).digest('hex'), createdBy: ADMIN_NAME });
  expect(gh.text('edit-links.json')).not.toContain(token);
  await expect(page.locator('#linkList .l')).toHaveCount(2);

  const revoke = page.locator('#linkList .l', { hasText: TEST_NAME }).locator('[data-revoke]');
  await revoke.click();
  await expect(revoke).toHaveText('確定停用？');
  await revoke.click();
  await expect(page.locator('#linkList .l')).toHaveCount(1);
  expect(JSON.parse(gh.text('edit-links.json')).links.find((l) => l.id === 'Ltest').revoked).toBe(true);
  await page.locator('[data-action="done"]').click();
  await expect(page.locator('.modal')).toHaveCount(0);
  // Closing the dialog forgets the link: it is not shown again.
  await row(page, '資深遊戲測試工程師').locator('[data-act="share"]').click();
  await expect(page.locator('#onceLink')).toHaveCount(0);
});
