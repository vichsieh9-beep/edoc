import { HttpError } from './errors.js';
const MAX_NAME=40,MAX_LINKS_PER_HOUR=10,RETRY='剛好有人同時更新，請重新整理後再試一次。';
const isAdmin=link=>link.role==='admin';
function requireAdmin(link){if(!isAdmin(link))throw new HttpError(403,'forbidden','只有管理員可以管理文件與編輯連結');}
function checkSlug(slug){if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug))throw new HttpError(400,'bad_request','文件代號錯誤');return slug;}
function cleanText(value,max,label){const s=typeof value==='string'?value.trim():'';if(!s||s.length>max||/[\u0000-\u001f\u007f]/.test(s))throw new HttpError(400,'bad_request',`${label}要 1～${max} 個字，不能換行`);return s;}
async function readDocument(gh,slug){const {json:doc}=await gh.readJson(`documents/${slug}/document.json`);if(doc.archived)throw new HttpError(409,'archived','這份文件已封存；要先還原才能修改');return doc;}
const sha256Hex=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(x=>x.toString(16).padStart(2,'0')).join('');
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function createEditLink({ body, auth, link, gh, now, random }) {
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

export async function listEditLinks({ body, auth, link }) {
  requireAdmin(link);
  const slug = checkSlug(body.doc);
  const links = (auth.registry.links || [])
    .filter((l) => !isAdmin(l) && (l.documents || []).some((d) => d === slug || d === '*'))
    .map((l) => ({ id: l.id, name: l.name, createdAt: l.createdAt, revoked: !!l.revoked, allDocuments: (l.documents || []).includes('*') }));
  return { links };
}

export async function revokeEditLink({ body, auth, link, gh }) {
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
