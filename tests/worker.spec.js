// Publish API (worker/src/index.js): every refusal path, against a fake GitHub.
import { test, expect } from '@playwright/test';
import { handle } from '../worker/src/index.js';
import { createFakeGithub, repoDocument, testLinks, TEST_TOKEN, TEST_NAME } from './fake-github.js';

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
