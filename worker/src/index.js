// EDoc publish API (Cloudflare Worker).
//
// Whoever holds an edit link can append the next formal version to
// documents/<slug>/document.json on GitHub; GitHub Actions then rebuilds and redeploys
// the public site. The Worker never edits or removes an existing version.
//
// Edit links are listed in edit-links.json at the repo root as SHA-256 hashes only;
// the link itself (#edit=<token>) is shown once to whoever created it.
//
// env: GITHUB_TOKEN (secret; fine-grained, Contents read/write on this repo only),
//      GITHUB_REPO, GITHUB_BRANCH, ALLOWED_ORIGIN (comma-separated).
// Requests are "simple" CORS requests (POST, text/plain JSON body) so browsers send no preflight.
import { nextVersion } from '../../src/engine/version.js';

const MAX_BODY = 1_500_000;
const MAX_HTML = 1_000_000;
const MAX_TEXT = 500;
const MAX_DETAILS = 40;
const MAX_PER_HOUR = 10;
const CLOCK_SKEW_MS = 15 * 60 * 1000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EDITOR = '編輯者：';
const CREATED = '建立時間：';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default { fetch: (request, env) => handle(request, env) };

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (!cors['Access-Control-Allow-Origin']) throw new HttpError(403, 'origin', '不接受這個來源的請求');
    if (request.method !== 'POST') throw new HttpError(405, 'method', '只接受 POST');
    const body = await readBody(request);
    const gh = github(env, deps.fetch || fetch);
    const link = await linkFor(body.token, gh);
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    if (path.endsWith('/session')) {
      checkDocument(link, body.doc);
      return reply(200, { name: link.name });
    }
    if (path.endsWith('/versions')) {
      return reply(201, await publish(body, link, gh, deps.now ? deps.now() : new Date()));
    }
    throw new HttpError(404, 'not_found', '找不到這個功能');
  } catch (e) {
    if (e instanceof HttpError) return reply(e.status, { error: e.code, message: e.message });
    return reply(500, { error: 'internal', message: '發布服務發生錯誤，請稍後再試' });
  }
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'too_large', '修改內容太大，無法發布');
  try {
    const body = JSON.parse(text);
    if (body && typeof body === 'object') return body;
  } catch {}
  throw new HttpError(400, 'bad_request', '請求格式錯誤');
}

async function linkFor(token, gh) {
  const invalid = new HttpError(401, 'unauthorized', '編輯連結無效或已停用，請向文件維護者索取新的連結');
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw invalid;
  const tokenHash = await sha256Hex(token);
  const { json } = await gh.readJson('edit-links.json');
  const link = (json.links || []).find((l) => l.tokenHash === tokenHash && !l.revoked);
  if (!link) throw invalid;
  return link;
}

function checkDocument(link, slug) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new HttpError(400, 'bad_request', '文件代號錯誤');
  if (!(link.documents || []).some((d) => d === '*' || d === slug)) {
    throw new HttpError(403, 'forbidden', '這條編輯連結不能修改這份文件');
  }
}

async function publish(body, link, gh, now) {
  checkDocument(link, body.doc);
  const path = `documents/${body.doc}/document.json`;
  const { json: doc, sha } = await gh.readJson(path);
  if (body.baseVersion !== doc.latestVersion) {
    throw new HttpError(409, 'conflict', `文件已經更新到 ${doc.latestVersion}，請重新整理後再修改；你的修改已暫存在這個瀏覽器。`);
  }
  const key = nextVersion(doc.latestVersion);
  if (body.versionKey !== key) throw new HttpError(400, 'bad_request', `新版本應為 ${key}`);
  const version = validateVersion(body.version, { previous: doc.latestVersion, editor: link.name, now });
  const recent = Object.values(doc.versions || {}).filter((v) => {
    const t = createdAt(v);
    return t !== null && now - t < 3600_000;
  }).length;
  if (recent >= MAX_PER_HOUR) throw new HttpError(429, 'rate_limited', '這份文件一小時內更新太多次，請稍後再試');
  // Append only: every existing version is carried over untouched.
  const next = { ...doc, latestVersion: key, versions: { ...doc.versions, [key]: version } };
  const commit = await gh.writeJson(path, next, sha, `Add ${key} to ${body.doc} by ${link.name} via EDoc`);
  return { version: key, commit };
}

// Keep only known fields. The content hash is recomputed by every viewer from the html,
// so a client-supplied hash is never stored.
export function validateVersion(v, { previous, editor, now }) {
  const bad = (message) => new HttpError(400, 'bad_version', message);
  if (!v || typeof v !== 'object') throw bad('版本資料錯誤');
  const text = (s) => typeof s === 'string' && s.length > 0 && s.length <= MAX_TEXT;
  if (!text(v.summary)) throw bad('版本摘要錯誤');
  if (!Array.isArray(v.details) || !v.details.length || v.details.length > MAX_DETAILS || !v.details.every(text)) {
    throw bad('詳細變更錯誤');
  }
  if (typeof v.html !== 'string' || !v.html.trim() || v.html.length > MAX_HTML) throw bad('文件內容錯誤或太大');
  if (v.previous !== previous) throw bad(`比較基準應為 ${previous}`);
  const editors = v.details.filter((d) => d.startsWith(EDITOR));
  if (editors.length !== 1 || editors[0] !== EDITOR + editor) throw bad('編輯者與編輯連結不符');
  const created = v.details.filter((d) => d.startsWith(CREATED));
  const t = created.length === 1 ? Date.parse(created[0].slice(CREATED.length)) : NaN;
  if (Number.isNaN(t) || Math.abs(now - t) > CLOCK_SKEW_MS) throw bad('建立時間錯誤');
  return { summary: v.summary, details: v.details.slice(), previous, html: v.html, uiChanges: [], aiSummary: null };
}

function createdAt(version) {
  const line = (version.details || []).find((d) => typeof d === 'string' && d.startsWith(CREATED));
  const t = line ? Date.parse(line.slice(CREATED.length)) : NaN;
  return Number.isNaN(t) ? null : t;
}

function github(env, fetchImpl) {
  const base = `https://api.github.com/repos/${env.GITHUB_REPO}/contents/`;
  const branch = env.GITHUB_BRANCH || 'main';
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'edoc-publish',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = (path) => base + path.split('/').map(encodeURIComponent).join('/');
  return {
    async readJson(path) {
      const res = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
      if (res.status === 404) throw new HttpError(404, 'not_found', '找不到這份文件');
      if (!res.ok) throw new HttpError(502, 'github', 'GitHub 暫時無法讀取，請稍後再試');
      const data = await res.json();
      let text;
      if (data.encoding === 'base64' && data.content) text = fromBase64Utf8(data.content);
      else {
        // Files over 1 MB come without inline content.
        const raw = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, {
          headers: { ...headers, Accept: 'application/vnd.github.raw' },
        });
        if (!raw.ok) throw new HttpError(502, 'github', 'GitHub 暫時無法讀取，請稍後再試');
        text = await raw.text();
      }
      return { json: JSON.parse(text), sha: data.sha };
    },
    async writeJson(path, value, sha, message) {
      const res = await fetchImpl(url(path), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: toBase64Utf8(JSON.stringify(value, null, 2) + '\n'), sha, branch }),
      });
      if (res.status === 409 || res.status === 422) {
        throw new HttpError(409, 'conflict', '剛好有人同時更新了文件，請重新整理後再試；你的修改已暫存在這個瀏覽器。');
      }
      if (!res.ok) throw new HttpError(502, 'github', 'GitHub 暫時無法寫入，請稍後再試');
      const data = await res.json();
      return data.commit && data.commit.sha;
    },
  };
}

async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function fromBase64Utf8(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
