import { nextVersion } from '../../src/engine/version.js';
import { HttpError } from './errors.js';
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
const EDITOR='編輯者：',CREATED='建立時間：';
const documentPath=slug=>`documents/${slug}/document.json`;
export async function publishLegacy({ body, link, gh, now }) {
  if (!(link.documents||[]).some(d=>d===body.doc||d==='*')) throw new HttpError(403,'forbidden','這條編輯連結不能修改這份文件');
  const path = documentPath(body.doc);
  const { doc, sha } = await gh.readJson(path).then(({json:doc,sha})=>{if(doc.archived)throw new HttpError(409,'archived','這份文件已封存；要先還原才能修改');return {doc,sha};});
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
export function validateVersion(v, { previous, editor, now, publication=false }) {
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
  if (!publication && (editors.length !== 1 || editors[0] !== EDITOR + editor)) throw bad('編輯者與編輯連結不符');
  const created = v.details.filter((d) => d.startsWith(CREATED));
  const t = created.length === 1 ? Date.parse(created[0].slice(CREATED.length)) : NaN;
  if (Number.isNaN(t) || Math.abs(now - t) > CLOCK_SKEW_MS) throw bad('建立時間錯誤');
  if(publication && (!/^[0-9a-f-]{36}$/.test(v.publicationId||'') || !/^[0-9a-f]{64}$/.test(v.contentHash||''))) throw bad('發布驗證資料錯誤');
  return { ...(publication?{publicationId:v.publicationId,contentHash:v.contentHash}:{}), summary: v.summary, details: v.details.slice(), previous, html: v.html, uiChanges: [], aiSummary: null };
}

const validHtml = (html) => typeof html === 'string' && !!html.trim() && html.length <= MAX_HTML;

function createdAt(version) {
  const line = (version.details || []).find((d) => typeof d === 'string' && d.startsWith(CREATED));
  const t = line ? Date.parse(line.slice(CREATED.length)) : NaN;
  return Number.isNaN(t) ? null : t;
}
