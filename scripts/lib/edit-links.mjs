// Edit links: whoever opens documents/<slug>/#edit=<token> can publish new versions.
// edit-links.json (committed) keeps only the SHA-256 of each token; the link is shown once.
import { createHash, randomBytes } from 'node:crypto';

export const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');

export function createLink(registry, { name, documents, now = new Date(), random = randomBytes }) {
  const clean = String(name || '').trim();
  if (!clean || clean.length > 40 || /[\n\r]/.test(clean)) throw new Error('請用 --name 指定名字（40 字以內），例如 --name 客戶法務');
  if (!Array.isArray(documents) || !documents.length) throw new Error('請指定文件');
  const token = random(24).toString('base64url');
  const link = {
    id: 'L' + random(3).toString('hex'),
    name: clean,
    documents,
    tokenHash: sha256Hex(token),
    createdAt: now.toISOString(),
    revoked: false,
  };
  return { registry: { ...registry, links: [...(registry.links || []), link] }, link, token };
}

export function revokeLink(registry, id) {
  const link = (registry.links || []).find((l) => l.id === id);
  if (!link) throw new Error(`找不到編輯連結 ${id}`);
  if (link.revoked) throw new Error(`${id}（${link.name}）已經停用`);
  return { ...registry, links: registry.links.map((l) => (l.id === id ? { ...l, revoked: true } : l)) };
}

export const editUrl = (siteUrl, slug, token) => new URL(`documents/${slug}/#edit=${token}`, siteUrl).href;
