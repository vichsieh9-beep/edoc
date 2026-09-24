// Routes the page's publish API calls to the real Worker code backed by a fake GitHub.
import { handle } from '../worker/src/index.js';
import { createFakeGithub } from './fake-github.js';
import { readFileSync } from 'node:fs';

// Local runs build pages with EDOC_PUBLISH_API; live-site runs use the configured API (if any).
const configured = JSON.parse(readFileSync(new URL('../edoc.config.json', import.meta.url), 'utf8')).publishApi;
export const PUBLISH_API = (process.env.EDOC_PUBLISH_API || configured || '').replace(/\/+$/, '');
export const WORKER_ENV = {
  GITHUB_TOKEN: 'test', GITHUB_REPO: 'vichsieh9-beep/edoc', GITHUB_BRANCH: 'main',
  ALLOWED_ORIGIN: 'http://127.0.0.1:4173,https://vichsieh9-beep.github.io',
};

export async function enablePublishing(page, { gh = createFakeGithub(), onRequest } = {}) {
  await page.route((url) => PUBLISH_API && url.href.startsWith(PUBLISH_API + '/'), async (route) => {
    const r = route.request();
    if (onRequest && (await onRequest(route)) === false) return;
    const all = await r.allHeaders();
    const headers = { 'content-type': all['content-type'] || 'text/plain', origin: all.origin || new URL(page.url()).origin };
    const req = new Request(r.url(), { method: r.method(), headers, body: r.method() === 'POST' ? r.postData() : undefined });
    const res = await handle(req, WORKER_ENV, { fetch: gh.fetch });
    await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers.entries()), body: await res.text() });
  });
  return gh;
}
