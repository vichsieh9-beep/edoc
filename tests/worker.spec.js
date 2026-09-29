// Publish API (worker/src/index.js): every refusal path, against a fake GitHub.
// Library management (create, rename, archive, edit links) needs an admin link.
import { test, expect } from '@playwright/test';
import { handle } from '../worker/src/index.js';
import { createHash } from 'node:crypto';
import { createFakeGithub, repoDocument, testLinks, TEST_TOKEN, TEST_NAME, ADMIN_TOKEN, ADMIN_NAME } from './fake-github.js';

const ORIGIN = 'https://vichsieh9-beep.github.io';
const ENV = { GITHUB_TOKEN: 'test', GITHUB_REPO: 'vichsieh9-beep/edoc', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: ORIGIN };
const NOW = new Date('2026-09-24T08:00:00.000Z');

function version(overrides = {}) {
  const base = repoDocument().versions['v0.7'];
  return {
    summary: '職務簡述 1 處修改',
    details: ['職務簡述 1 處修改', '基準版本：v0.7', '編輯者：' + TEST_NAME, '建立時間：' + NOW.toISOString()],
    previous: 'v0.7', html: base.html.replace('並持續追蹤', '並持續<span class="changed">嚴謹</span>追蹤'),
    uiChanges: [], aiSummary: null, hash: 'f'.repeat(64),
    ...overrides,
  };
}
async function call(gh, path, body, { origin = ORIGIN, method = 'POST', raw } = {}) {
  const req = new Request('https://edoc-publish.example.workers.dev' + path, {
    method, headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...(origin ? { Origin: origin } : {}) },
    body: method === 'POST' ? raw ?? JSON.stringify(body) : undefined,
  });
  const res = await handle(req, ENV, { fetch: gh.fetch, now: () => NOW });
  return { status: res.status, body: res.status === 204 ? null : await res.json(), headers: res.headers };
}
const publish = (gh, extra = {}) => call(gh, '/versions', {
  token: TEST_TOKEN, doc: 'qa-senior-game-qa', baseVersion: 'v0.7', versionKey: 'v0.8', version: version(), ...extra,
});

test('session: a valid link returns its name; CORS only for the site origin', async () => {
  const gh = createFakeGithub();
  const ok = await call(gh, '/session', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' });
  expect(ok).toMatchObject({ status: 200, body: { name: TEST_NAME } });
  expect(ok.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  expect((await call(gh, '/session', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' }, { origin: 'https://evil.example' })).status).toBe(403);
  expect((await call(gh, '/session', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' }, { origin: null })).status).toBe(403);
  const pre = await call(gh, '/versions', null, { method: 'OPTIONS' });
  expect(pre.status).toBe(204);
});

test('session: unknown, revoked or wrong-document links are refused', async () => {
  const links = testLinks([{ id: 'Lother', name: '別人', documents: ['other-doc'], tokenHash: '0'.repeat(64), revoked: false }]);
  const gh = createFakeGithub({ links });
  expect((await call(gh, '/session', { token: 'x'.repeat(32), doc: 'qa-senior-game-qa' })).status).toBe(401);
  expect((await call(gh, '/session', { token: 'short', doc: 'qa-senior-game-qa' })).status).toBe(401);
  expect((await call(gh, '/session', { token: TEST_TOKEN, doc: 'other-doc' })).status).toBe(403);
  expect((await call(gh, '/session', { token: TEST_TOKEN, doc: '../etc' })).status).toBe(400);
  links.links[0].revoked = true;
  const revoked = createFakeGithub({ links });
  const r = await call(revoked, '/session', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' });
  expect(r.status).toBe(401);
  expect(r.body.message).toContain('編輯連結無效或已停用');
});

test('publish: appends the next version only, stores no client hash, never touches older versions', async () => {
  const gh = createFakeGithub();
  const before = gh.read();
  const r = await publish(gh);
  expect(r).toMatchObject({ status: 201, body: { version: 'v0.8', commit: 'c1' } });
  const after = gh.read();
  expect(after.latestVersion).toBe('v0.8');
  for (const v of Object.keys(before.versions)) expect(after.versions[v]).toEqual(before.versions[v]);
  expect(Object.keys(after.versions['v0.8'])).toEqual(['summary', 'details', 'previous', 'html', 'uiChanges', 'aiSummary']);
  expect(after.versions['v0.8'].hash).toBeUndefined();
  expect(gh.text('documents/qa-senior-game-qa/document.json')).toBe(JSON.stringify(after, null, 2) + '\n');
});

test('publish: refuses outdated bases, wrong version numbers and forged editors', async () => {
  const gh = createFakeGithub();
  expect((await publish(gh, { baseVersion: 'v0.6' })).status).toBe(409);
  expect((await publish(gh, { versionKey: 'v0.9' })).status).toBe(400);
  expect((await publish(gh, { version: version({ previous: 'v0.6' }) })).status).toBe(400);
  const forged = version({ details: ['x', '編輯者：Vic', '建立時間：' + NOW.toISOString()] });
  const r = await publish(gh, { version: forged });
  expect(r.status).toBe(400);
  expect(r.body.message).toBe('編輯者與編輯連結不符');
  const stale = version({ details: ['x', '編輯者：' + TEST_NAME, '建立時間：2026-09-23T00:00:00.000Z'] });
  expect((await publish(gh, { version: stale })).status).toBe(400);
  expect(gh.commits).toHaveLength(0);
});

test('publish: refuses oversized or malformed input', async () => {
  const gh = createFakeGithub();
  expect((await publish(gh, { version: version({ html: 'x'.repeat(1_000_001) }) })).status).toBe(400);
  expect((await call(gh, '/versions', null, { raw: 'x'.repeat(1_500_001) })).status).toBe(413);
  expect((await call(gh, '/versions', null, { raw: 'not json' })).status).toBe(400);
  expect((await publish(gh, { version: version({ summary: '' }) })).status).toBe(400);
  expect((await publish(gh, { version: 'nope' })).status).toBe(400);
  expect((await call(gh, '/nothing', { token: TEST_TOKEN })).status).toBe(404);
  expect((await call(gh, '/versions', null, { method: 'GET' })).status).toBe(405);
});

test('publish: at most 10 new versions per document per hour', async () => {
  const doc = repoDocument();
  let latest = 'v0.7';
  for (let i = 0; i < 10; i++) {
    const key = 'v' + (parseFloat(latest.slice(1)) + 0.1).toFixed(1);
    doc.versions[key] = { ...version(), previous: latest };
    latest = key;
  }
  doc.latestVersion = latest;
  const gh = createFakeGithub({ document: doc });
  const r = await publish(gh, { baseVersion: latest, versionKey: 'v1.8', version: version({ previous: latest }) });
  expect(r.status).toBe(429);
});

test('publish: a concurrent write on GitHub is reported as a conflict', async () => {
  const gh = createFakeGithub();
  const racing = { ...gh, fetch: async (url, init = {}) => {
    if (init.method === 'PUT') gh.write('documents/qa-senior-game-qa/document.json', { ...gh.read(), nextRevisionIndex: 2 });
    return gh.fetch(url, init);
  } };
  const r = await publish(racing);
  expect(r.status).toBe(409);
  expect(r.body.message).toContain('剛好有人同時更新了文件');
});

// ── Library management: admin links only ──────────────────────────────────────────────────
const admin = (gh, path, extra = {}, opts = {}) => call(gh, path, { token: ADMIN_TOKEN, ...extra }, opts);
const seq = (...chunks) => { let i = 0; return (n) => Uint8Array.from(chunks[Math.min(i++, chunks.length - 1)].slice(0, n)); };
const callWith = async (gh, path, body, deps) => {
  const req = new Request('https://edoc-publish.example.workers.dev' + path, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: ORIGIN }, body: JSON.stringify(body),
  });
  const res = await handle(req, ENV, { fetch: gh.fetch, now: () => NOW, ...deps });
  return { status: res.status, body: await res.json() };
};

test('admin session: the library accepts admin links only; documents report the role', async () => {
  const gh = createFakeGithub();
  expect(await admin(gh, '/session', { scope: 'library' })).toMatchObject({ status: 200, body: { name: ADMIN_NAME, role: 'admin' } });
  expect((await call(gh, '/session', { token: TEST_TOKEN, scope: 'library' })).status).toBe(403);
  expect((await admin(gh, '/session', { doc: 'qa-senior-game-qa' })).body).toEqual({ name: ADMIN_NAME, role: 'admin' });
  expect((await call(gh, '/session', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' })).body).toEqual({ name: TEST_NAME, role: 'editor' });
});

test('create: v0.1 at a new generated address, attributed to the admin; editors are refused', async () => {
  const gh = createFakeGithub();
  const r = await callWith(gh, '/documents', { token: ADMIN_TOKEN, title: ' 【GDD】Mini Game 規格書 ', method: 'blank', html: '<h1>【GDD】Mini Game 規格書</h1>' },
    { random: seq([3, 4, 5, 6]) });
  expect(r).toMatchObject({ status: 201, body: { slug: 'd-defg', version: 'v0.1', commit: 'c1' } });
  const doc = gh.read('documents/d-defg/document.json');
  expect(doc).toEqual({
    documentId: 'd-defg', title: '【GDD】Mini Game 規格書', subtitle: '', latestVersion: 'v0.1', nextRevisionIndex: 1,
    versions: { 'v0.1': {
      summary: '建立文件：空白文件',
      details: ['建立方式：空白文件', '編輯者：' + ADMIN_NAME, '建立時間：' + NOW.toISOString()],
      previous: null, html: '<h1>【GDD】Mini Game 規格書</h1>', uiChanges: [], aiSummary: null,
    } },
  });
  expect(gh.commits[0].message).toBe(`Create document d-defg (【GDD】Mini Game 規格書) by ${ADMIN_NAME} via EDoc`);
  const editor = await call(gh, '/documents', { token: TEST_TOKEN, title: 'x', method: 'blank', html: '<h1>x</h1>' });
  expect(editor.status).toBe(403);
  expect(gh.commits).toHaveLength(1);
});

test('create: a taken address is skipped', async () => {
  const gh = createFakeGithub({ documents: { 'd-aaaa': { ...repoDocument(), documentId: 'd-aaaa' } } });
  const r = await callWith(gh, '/documents', { token: ADMIN_TOKEN, title: 'New', method: 'blank', html: '<h1>New</h1>' },
    { random: seq([0, 0, 0, 0], [1, 1, 1, 1]) });
  expect(r.body.slug).toBe('d-bbbb');
  expect(gh.read('documents/d-aaaa/document.json').documentId).toBe('d-aaaa');
});

test('create: copy names its source version, Word names its file; bad input is refused', async () => {
  const gh = createFakeGithub();
  const copy = await admin(gh, '/documents', { title: '複本', method: 'copy', html: '<h1>複本</h1>', source: { doc: 'qa-senior-game-qa', version: 'v0.7' } });
  expect(copy.status).toBe(201);
  expect(gh.read(`documents/${copy.body.slug}/document.json`).versions['v0.1'].summary).toBe('建立文件：複製現有文件（【QA】資深遊戲測試工程師 v0.7）');
  const word = await admin(gh, '/documents', { title: 'GDD', method: 'docx', html: '<h1>GDD</h1><p>x</p>', fileName: 'Mini Game.docx' });
  expect(gh.read(`documents/${word.body.slug}/document.json`).versions['v0.1'].details[0]).toBe('建立方式：上傳 Word（Mini Game.docx）');
  const bad = [
    { title: '', method: 'blank', html: '<h1>x</h1>' },
    { title: '字'.repeat(81), method: 'blank', html: '<h1>x</h1>' },
    { title: 'a\nb', method: 'blank', html: '<h1>x</h1>' },
    { title: 'x', method: 'upload', html: '<h1>x</h1>' },
    { title: 'x', method: 'blank', html: ' ' },
    { title: 'x', method: 'docx', html: '<h1>x</h1>' },
    { title: 'x', method: 'copy', html: '<h1>x</h1>', source: { doc: 'qa-senior-game-qa', version: 'v9.9' } },
    { title: 'x', method: 'blank', html: 'x'.repeat(1_000_001) },
  ];
  for (const body of bad) expect((await admin(gh, '/documents', body)).status, JSON.stringify(body).slice(0, 80)).toBe(400);
  expect((await admin(gh, '/documents', { title: 'x', method: 'copy', html: '<h1>x</h1>', source: { doc: 'nope', version: 'v0.1' } })).status).toBe(404);
  expect(gh.commits).toHaveLength(2);
});

test('create: at most 10 new documents per hour', async () => {
  const history = Array.from({ length: 10 }, (_, i) => `Create document d-00${i} (x) by Vic via EDoc`);
  const gh = createFakeGithub({ history: [...history, 'Add v0.8 to qa-senior-game-qa by 客戶法務 via EDoc'] });
  const r = await admin(gh, '/documents', { title: 'x', method: 'blank', html: '<h1>x</h1>' });
  expect(r.status).toBe(429);
  const ok = createFakeGithub({ history: history.slice(1) });
  expect((await admin(ok, '/documents', { title: 'x', method: 'blank', html: '<h1>x</h1>' })).status).toBe(201);
});

test('rename changes only the name: same address, no new version', async () => {
  const gh = createFakeGithub();
  const before = gh.read();
  const r = await admin(gh, '/documents/rename', { doc: 'qa-senior-game-qa', title: '【QA】資深遊戲測試工程師（2027）' });
  expect(r).toMatchObject({ status: 200, body: { slug: 'qa-senior-game-qa', title: '【QA】資深遊戲測試工程師（2027）', commit: 'c1' } });
  expect(gh.read()).toEqual({ ...before, title: '【QA】資深遊戲測試工程師（2027）' });
  expect((await admin(gh, '/documents/rename', { doc: 'qa-senior-game-qa', title: '【QA】資深遊戲測試工程師（2027）' })).body.commit).toBeNull();
  expect((await call(gh, '/documents/rename', { token: TEST_TOKEN, doc: 'qa-senior-game-qa', title: 'x' })).status).toBe(403);
  expect((await admin(gh, '/documents/rename', { doc: 'nope', title: 'x' })).status).toBe(404);
});

test('archive keeps every version, blocks publishing and new links; restore undoes it', async () => {
  const gh = createFakeGithub();
  const before = gh.read();
  const r = await admin(gh, '/documents/archive', { doc: 'qa-senior-game-qa' });
  expect(r).toMatchObject({ status: 200, body: { archived: { at: NOW.toISOString(), by: ADMIN_NAME } } });
  expect(gh.read()).toEqual({ ...before, archived: { at: NOW.toISOString(), by: ADMIN_NAME } });
  expect((await admin(gh, '/documents/archive', { doc: 'qa-senior-game-qa' })).status).toBe(409);
  const blocked = await publish(gh);
  expect(blocked.status).toBe(409);
  expect(blocked.body.message).toContain('已封存');
  expect((await admin(gh, '/links', { doc: 'qa-senior-game-qa', name: 'HR' })).status).toBe(409);
  expect((await call(gh, '/documents/archive', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' })).status).toBe(403);

  expect((await admin(gh, '/documents/restore', { doc: 'qa-senior-game-qa' })).body.archived).toBeNull();
  expect(gh.read()).toEqual(before);
  expect((await admin(gh, '/documents/restore', { doc: 'qa-senior-game-qa' })).status).toBe(409);
  expect((await publish(gh)).status).toBe(201);
});

test('edit links from the web: shown once, stored as a hash, listed per document, revocable', async () => {
  const gh = createFakeGithub();
  const r = await callWith(gh, '/links', { token: ADMIN_TOKEN, doc: 'qa-senior-game-qa', name: ' HR Grace ' }, { random: (n) => new Uint8Array(n).fill(7) });
  expect(r.status).toBe(201);
  expect(r.body).toMatchObject({ id: 'L070707', name: 'HR Grace', createdAt: NOW.toISOString() });
  const token = r.body.token;
  expect(token.length).toBeGreaterThanOrEqual(32);
  const registry = gh.text('edit-links.json');
  expect(registry).not.toContain(token);
  expect(JSON.parse(registry).links.at(-1)).toEqual({
    id: 'L070707', name: 'HR Grace', documents: ['qa-senior-game-qa'], tokenHash: createHash('sha256').update(token).digest('hex'),
    createdAt: NOW.toISOString(), createdBy: ADMIN_NAME, revoked: false,
  });
  // The new link works right away, for that document only.
  expect((await call(gh, '/session', { token, doc: 'qa-senior-game-qa' })).body).toEqual({ name: 'HR Grace', role: 'editor' });
  expect((await call(gh, '/documents', { token, title: 'x', method: 'blank', html: '<h1>x</h1>' })).status).toBe(403);

  const list = await admin(gh, '/links/list', { doc: 'qa-senior-game-qa' });
  expect(list.body.links.map((l) => [l.id, l.name, l.revoked])).toEqual([['Ltest', TEST_NAME, false], ['L070707', 'HR Grace', false]]);
  expect(JSON.stringify(list.body)).not.toContain('tokenHash');

  expect((await admin(gh, '/links/revoke', { id: 'L070707' })).body).toMatchObject({ id: 'L070707', revoked: true });
  expect((await call(gh, '/session', { token, doc: 'qa-senior-game-qa' })).status).toBe(401);
  expect((await admin(gh, '/links/revoke', { id: 'L070707' })).status).toBe(409);
  expect((await admin(gh, '/links/revoke', { id: 'Ladmin' })).status).toBe(403);
  expect((await admin(gh, '/links/revoke', { id: 'Lnope' })).status).toBe(404);
  expect((await call(gh, '/links/revoke', { token: TEST_TOKEN, id: 'Ltest' })).status).toBe(403);
  expect((await call(gh, '/links/list', { token: TEST_TOKEN, doc: 'qa-senior-game-qa' })).status).toBe(403);
  expect((await admin(gh, '/links', { doc: 'qa-senior-game-qa', name: '' })).status).toBe(400);
  expect((await admin(gh, '/links', { doc: 'nope', name: 'x' })).status).toBe(404);
});

test('edit links: at most 10 new links per hour', async () => {
  const recent = Array.from({ length: 10 }, (_, i) => ({ id: 'Lr' + i, name: 'r' + i, documents: ['qa-senior-game-qa'], tokenHash: String(i).repeat(64), createdAt: NOW.toISOString(), revoked: false }));
  const gh = createFakeGithub({ links: testLinks(recent) });
  expect((await admin(gh, '/links', { doc: 'qa-senior-game-qa', name: 'x' })).status).toBe(429);
});
