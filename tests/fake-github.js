// In-memory stand-in for the GitHub contents API, used by the real Worker code in tests.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TEST_TOKEN = 'edoc-test-token-0123456789abcdef';
export const TEST_NAME = '客戶法務';
const sha = (text) => createHash('sha1').update(text).digest('hex');
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function testLinks(extra = []) {
  return {
    links: [
      { id: 'Ltest', name: TEST_NAME, documents: ['qa-senior-game-qa'], tokenHash: createHash('sha256').update(TEST_TOKEN).digest('hex'), createdAt: '2026-09-24T00:00:00.000Z', revoked: false },
      ...extra,
    ],
  };
}
export const repoDocument = () => JSON.parse(readFileSync(join(ROOT, 'documents/qa-senior-game-qa/document.json'), 'utf8'));

export function createFakeGithub({ document = repoDocument(), links = testLinks() } = {}) {
  const files = new Map();
  const put = (path, text) => files.set(path, { text, sha: sha(text) });
  put('documents/qa-senior-game-qa/document.json', JSON.stringify(document, null, 2) + '\n');
  put('edit-links.json', JSON.stringify(links, null, 2) + '\n');
  const commits = [];
  async function fetchImpl(url, init = {}) {
    const m = new URL(url).pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (!m) return json(404, { message: 'Not Found' });
    const path = m[1].split('/').map(decodeURIComponent).join('/');
    const file = files.get(path);
    if ((init.method || 'GET') === 'GET') {
      if (!file) return json(404, { message: 'Not Found' });
      if (String(init.headers?.Accept || '').includes('raw')) return new Response(file.text);
      return json(200, { sha: file.sha, encoding: 'base64', content: Buffer.from(file.text).toString('base64') });
    }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      if (!file || body.sha !== file.sha) return json(409, { message: 'sha does not match' });
      put(path, Buffer.from(body.content, 'base64').toString('utf8'));
      commits.push({ path, message: body.message });
      return json(200, { commit: { sha: 'c' + commits.length } });
    }
    return json(405, { message: 'Method not allowed' });
  }
  return {
    fetch: fetchImpl,
    commits,
    text: (path) => files.get(path).text,
    read: (path = 'documents/qa-senior-game-qa/document.json') => JSON.parse(files.get(path).text),
    write: (path, value) => put(path, JSON.stringify(value, null, 2) + '\n'),
  };
}
