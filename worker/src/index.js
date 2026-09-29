// EDoc publish API (Cloudflare Worker).
//
// Whoever holds an edit link can append the next formal version to
// documents/<slug>/document.json on GitHub; GitHub Actions then rebuilds and redeploys
// the public site. The Worker never edits or removes an existing version.
//
// An admin link (role "admin") can also manage the library: create, rename, archive and
// restore documents, and create or revoke edit links for one document.
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
const MAX_PER_HOUR = 10;          // new versions per document
const MAX_CREATES_PER_HOUR = 10;  // new documents
const MAX_LINKS_PER_HOUR = 10;    // new edit links
const MAX_TITLE = 80;
const MAX_NAME = 40;
const CLOCK_SKEW_MS = 15 * 60 * 1000;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const VERSION = /^v\d+\.\d$/;
const EDITOR = '編輯者：';
const CREATED = '建立時間：';
const CREATE_COMMIT = 'Create document ';
const METHODS = { blank: '空白文件', copy: '複製現有文件', paste: '貼上文字', docx: '上傳 Word' };
const RETRY = '剛好有人同時更新，請重新整理後再試一次。';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export default { fetch: (request, env) => handle(request, env) };

const ROUTES = {
  '/session': session,
  '/versions': publish,
  '/documents': createDocument,
  '/documents/rename': renameDocument,
  '/documents/archive': (ctx) => setArchived(ctx, true),
  '/documents/restore': (ctx) => setArchived(ctx, false),
  '/links': createEditLink,
  '/links/list': listEditLinks,
  '/links/revoke': revokeEditLink,
};
const CREATED_STATUS = new Set(['/versions', '/documents', '/links']);

export async function handle(request, env, deps = {}) {
  const cors = corsHeaders(request, env);
  const reply = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    if (!cors['Access-Control-Allow-Origin']) throw new HttpError(403, 'origin', '不接受這個來源的請求');
    if (request.method !== 'POST') throw new HttpError(405, 'method', '只接受 POST');
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route = ROUTES[path];
    if (!route) throw new HttpError(404, 'not_found', '找不到這個功能');
    const body = await readBody(request);
    const gh = github(env, deps.fetch || fetch);
    const auth = await linkFor(body.token, gh);
    const now = deps.now ? deps.now() : new Date();
    const result = await route({ body, auth, link: auth.link, gh, now, random: deps.random || randomBytes });
    return reply(CREATED_STATUS.has(path) ? 201 : 200, result);
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
  const { json: registry, sha } = await gh.readJson('edit-links.json');
  const link = (registry.links || []).find((l) => l.tokenHash === tokenHash && !l.revoked);
  if (!link) throw invalid;
  return { link, registry, sha };
}

const isAdmin = (link) => link.role === 'admin';
function requireAdmin(link) {
  if (!isAdmin(link)) throw new HttpError(403, 'forbidden', '只有管理員可以管理文件與編輯連結');
}

function checkSlug(slug) {
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new HttpError(400, 'bad_request', '文件代號錯誤');
  return slug;
}

function checkDocument(link, slug) {
  checkSlug(slug);
  if (!(link.documents || []).some((d) => d === '*' || d === slug)) {
    throw new HttpError(403, 'forbidden', '這條編輯連結不能修改這份文件');
  }
}

function cleanText(value, max, label) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) throw new HttpError(400, 'bad_request', `${label}要 1～${max} 個字，不能換行`);
  return s;
}

const documentPath = (slug) => `documents/${slug}/document.json`;

async function readDocument(gh, slug, { active = false } = {}) {
  const { json: doc, sha } = await gh.readJson(documentPath(slug));
  if (active && doc.archived) throw new HttpError(409, 'archived', '這份文件已封存；要先還原才能修改');
  return { doc, sha };
}

async function session({ body, link }) {
  if (body.scope === 'library') {
    requireAdmin(link);
    return { name: link.name, role: 'admin' };
  }
  checkDocument(link, body.doc);
  return { name: link.name, role: isAdmin(link) ? 'admin' : 'editor' };
}

async function publish({ body, link, gh, now }) {
  checkDocument(link, body.doc);
  const path = documentPath(body.doc);
  const { doc, sha } = await readDocument(gh, body.doc, { active: true });
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
  const commit = await gh.writeJson(path, next, sha, `Add ${key} to ${body.doc} by ${link.name} via EDoc`,
    '剛好有人同時更新了文件，請重新整理後再試；你的修改已暫存在這個瀏覽器。');
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
  if (!validHtml(v.html)) throw bad('文件內容錯誤或太大');
  if (v.previous !== previous) throw bad(`比較基準應為 ${previous}`);
  const editors = v.details.filter((d) => d.startsWith(EDITOR));
  if (editors.length !== 1 || editors[0] !== EDITOR + editor) throw bad('編輯者與編輯連結不符');
  const created = v.details.filter((d) => d.startsWith(CREATED));
  const t = created.length === 1 ? Date.parse(created[0].slice(CREATED.length)) : NaN;
  if (Number.isNaN(t) || Math.abs(now - t) > CLOCK_SKEW_MS) throw bad('建立時間錯誤');
  return { summary: v.summary, details: v.details.slice(), previous, html: v.html, uiChanges: [], aiSummary: null };
}

const validHtml = (html) => typeof html === 'string' && !!html.trim() && html.length <= MAX_HTML;

function createdAt(version) {
  const line = (version.details || []).find((d) => typeof d === 'string' && d.startsWith(CREATED));
  const t = line ? Date.parse(line.slice(CREATED.length)) : NaN;
  return Number.isNaN(t) ? null : t;
}

// New document: the page prepares the html (blank title, copied, pasted or converted from Word);
// the Worker picks the address and stores it as v0.1.
async function createDocument({ body, link, gh, now, random }) {
  requireAdmin(link);
  const title = cleanText(body.title, MAX_TITLE, '文件名稱');
  const method = body.method;
  if (!Object.hasOwn(METHODS, method)) throw new HttpError(400, 'bad_request', '建立方式錯誤');
  if (!validHtml(body.html)) throw new HttpError(400, 'bad_request', '文件內容是空的或太大');
  let how = METHODS[method];
  if (method === 'copy') {
    const source = body.source || {};
    const { doc: from } = await readDocument(gh, checkSlug(source.doc));
    if (typeof source.version !== 'string' || !VERSION.test(source.version) || !from.versions?.[source.version]) {
      throw new HttpError(400, 'bad_request', '來源版本錯誤');
    }
    how += `（${from.title} ${source.version}）`;
  } else if (method === 'docx') {
    how += `（${cleanText(body.fileName, 200, '檔名')}）`;
  }
  const since = new Date(now - 3600_000).toISOString();
  const created = (await gh.recentCommits('documents', since)).filter((m) => m.startsWith(CREATE_COMMIT)).length;
  if (created >= MAX_CREATES_PER_HOUR) throw new HttpError(429, 'rate_limited', '一小時內新增太多文件，請稍後再試');

  let slug = null;
  for (let i = 0; i < 5 && !slug; i++) {
    const candidate = 'd-' + [...random(4)].map((b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
    if (!(await gh.exists(documentPath(candidate)))) slug = candidate;
  }
  if (!slug) throw new HttpError(503, 'busy', '暫時無法產生文件網址，請再試一次');
  const doc = {
    documentId: slug,
    title,
    subtitle: '',
    latestVersion: 'v0.1',
    nextRevisionIndex: 1,
    versions: {
      'v0.1': {
        summary: `建立文件：${how}`,
        details: [`建立方式：${how}`, EDITOR + link.name, CREATED + now.toISOString()],
        previous: null,
        html: body.html,
        uiChanges: [],
        aiSummary: null,
      },
    },
  };
  const commit = await gh.writeJson(documentPath(slug), doc, undefined, `${CREATE_COMMIT}${slug} (${title}) by ${link.name} via EDoc`, RETRY);
  return { slug, version: 'v0.1', commit };
}

// Renaming changes the name in the library and page header only: no new version, same address.
async function renameDocument({ body, link, gh }) {
  requireAdmin(link);
  const slug = checkSlug(body.doc);
  const title = cleanText(body.title, MAX_TITLE, '文件名稱');
  const { doc, sha } = await readDocument(gh, slug);
  if (doc.title === title) return { slug, title, commit: null };
  const commit = await gh.writeJson(documentPath(slug), { ...doc, title }, sha, `Rename ${slug} to ${title} by ${link.name} via EDoc`, RETRY);
  return { slug, title, commit };
}

// Archived documents leave the library and their page only says so; every version is kept.
async function setArchived({ body, link, gh, now }, archive) {
  requireAdmin(link);
  const slug = checkSlug(body.doc);
  const { doc, sha } = await readDocument(gh, slug);
  if (archive === !!doc.archived) throw new HttpError(409, 'conflict', archive ? '這份文件已經封存' : '這份文件沒有封存');
  const { archived, ...rest } = doc;
  const next = archive ? { ...doc, archived: { at: now.toISOString(), by: link.name } } : rest;
  const commit = await gh.writeJson(documentPath(slug), next, sha, `${archive ? 'Archive' : 'Restore'} ${slug} by ${link.name} via EDoc`, RETRY);
  return { slug, archived: next.archived || null, commit };
}

async function createEditLink({ body, auth, link, gh, now, random }) {
  requireAdmin(link);
  const slug = checkSlug(body.doc);
  await readDocument(gh, slug, { active: true });
  const name = cleanText(body.name, MAX_NAME, '名字');
  const links = auth.registry.links || [];
  const recent = links.filter((l) => now - Date.parse(l.createdAt) < 3600_000).length;
  if (recent >= MAX_LINKS_PER_HOUR) throw new HttpError(429, 'rate_limited', '一小時內產生太多編輯連結，請稍後再試');
  const token = base64url(random(24));
  let id;
  do id = 'L' + [...random(3)].map((b) => b.toString(16).padStart(2, '0')).join('');
  while (links.some((l) => l.id === id));
  const entry = { id, name, documents: [slug], tokenHash: await sha256Hex(token), createdAt: now.toISOString(), createdBy: link.name, revoked: false };
  const commit = await gh.writeJson('edit-links.json', { ...auth.registry, links: [...links, entry] }, auth.sha,
    `Add edit link ${id} (${name}) for ${slug} via EDoc`, RETRY);
  // The only time the token leaves the Worker: GitHub keeps its hash.
  return { id, name, createdAt: entry.createdAt, token, commit };
}

async function listEditLinks({ body, auth, link }) {
  requireAdmin(link);
  const slug = checkSlug(body.doc);
  const links = (auth.registry.links || [])
    .filter((l) => !isAdmin(l) && (l.documents || []).some((d) => d === slug || d === '*'))
    .map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt, revoked: !!l.revoked, allDocuments: (l.documents || []).includes('*') }));
  return { links };
}

async function revokeEditLink({ body, auth, link, gh }) {
  requireAdmin(link);
  const target = (auth.registry.links || []).find((l) => l.id === body.id);
  if (!target) throw new HttpError(404, 'not_found', '找不到這條編輯連結');
  if (isAdmin(target)) throw new HttpError(403, 'forbidden', '管理員連結只能在終端機停用');
  if (target.revoked) throw new HttpError(409, 'conflict', '這條編輯連結已經停用');
  const links = auth.registry.links.map((l) => (l.id === target.id ? { ...l, revoked: true } : l));
  const commit = await gh.writeJson('edit-links.json', { ...auth.registry, links }, auth.sha,
    `Revoke edit link ${target.id} (${target.name}) via EDoc`, RETRY);
  return { id: target.id, revoked: true, commit };
}

function github(env, fetchImpl) {
  const api = `https://api.github.com/repos/${env.GITHUB_REPO}/`;
  const base = api + 'contents/';
  const branch = env.GITHUB_BRANCH || 'main';
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'edoc-publish',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const url = (path) => base + path.split('/').map(encodeURIComponent).join('/');
  const unavailable = () => new HttpError(502, 'github', 'GitHub 暫時無法讀取，請稍後再試');
  return {
    async readJson(path) {
      const res = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
      if (res.status === 404) throw new HttpError(404, 'not_found', '找不到這份文件');
      if (!res.ok) throw unavailable();
      const data = await res.json();
      let text;
      if (data.encoding === 'base64' && data.content) text = fromBase64Utf8(data.content);
      else {
        // Files over 1 MB come without inline content.
        const raw = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, {
          headers: { ...headers, Accept: 'application/vnd.github.raw' },
        });
        if (!raw.ok) throw unavailable();
        text = await raw.text();
      }
      return { json: JSON.parse(text), sha: data.sha };
    },
    async exists(path) {
      const res = await fetchImpl(`${url(path)}?ref=${encodeURIComponent(branch)}`, { headers });
      if (res.status === 404) return false;
      if (!res.ok) throw unavailable();
      return true;
    },
    // Messages of the commits touching `path` since `since` (ISO time).
    async recentCommits(path, since) {
      const q = new URLSearchParams({ sha: branch, path, since, per_page: '100' });
      const res = await fetchImpl(`${api}commits?${q}`, { headers });
      if (!res.ok) throw unavailable();
      return (await res.json()).map((c) => (c.commit && c.commit.message) || '');
    },
    // sha undefined creates the file (GitHub refuses if it already exists).
    async writeJson(path, value, sha, message, conflictMessage) {
      const res = await fetchImpl(url(path), {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, content: toBase64Utf8(JSON.stringify(value, null, 2) + '\n'), sha, branch }),
      });
      if (res.status === 409 || res.status === 422) throw new HttpError(409, 'conflict', conflictMessage);
      if (!res.ok) throw new HttpError(502, 'github', 'GitHub 暫時無法寫入，請稍後再試');
      const data = await res.json();
      return data.commit && data.commit.sha;
    },
  };
}

function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
