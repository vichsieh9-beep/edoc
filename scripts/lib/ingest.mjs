// Bring versions created in the browser back into document.json (the content SSOT).
// Input is a review HTML exported with 「匯出審閱版」. Formal versions are immutable:
// existing versions must be identical, and new versions must continue the version chain.
const LOCKED_FIELDS = ['html', 'previous', 'summary', 'details'];
const byVersion = (a, b) => parseFloat(a.slice(1)) - parseFloat(b.slice(1));

function readEmbeddedJson(html, id, fallback) {
  const m = html.match(new RegExp(`<script\\b[^>]*\\bid="${id}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) {
    if (fallback !== undefined) return fallback;
    throw new Error(`找不到 ${id}：這不是 EDoc 匯出的審閱版 HTML`);
  }
  return JSON.parse(m[1]);
}

export function reviewDocumentId(html) {
  return readEmbeddedJson(html, 'documentState').documentId;
}

export function ingestReviewHtml(doc, html) {
  const versions = readEmbeddedJson(html, 'versionData');
  const state = readEmbeddedJson(html, 'documentState');
  const revisions = readEmbeddedJson(html, 'revisionData', []);
  if (state.documentId !== doc.documentId) {
    throw new Error(`documentId 不符：檔案是 ${state.documentId}，正本是 ${doc.documentId}`);
  }
  for (const [v, current] of Object.entries(doc.versions)) {
    const incoming = versions[v];
    if (!incoming) throw new Error(`匯入檔缺少正式版本 ${v}`);
    for (const k of LOCKED_FIELDS) {
      if (JSON.stringify(incoming[k]) !== JSON.stringify(current[k])) {
        throw new Error(`正式版本 ${v} 的 ${k} 與正本不同；正式版本不可修改，拒絕匯入`);
      }
    }
  }
  const added = Object.keys(versions).filter((v) => !(v in doc.versions)).sort(byVersion);
  let latest = doc.latestVersion;
  for (const v of added) {
    if (versions[v].previous !== latest) {
      throw new Error(`新版本 ${v} 的比較基準是 ${versions[v].previous}，應為 ${latest}`);
    }
    latest = v;
  }
  if (state.latestVersion !== latest) {
    throw new Error(`匯入檔的最新版本是 ${state.latestVersion}，但版本鏈最後是 ${latest}`);
  }
  const next = { ...doc, latestVersion: latest, versions: { ...doc.versions } };
  for (const v of added) next.versions[v] = versions[v];
  if (Number.isInteger(state.nextRevisionIndex)) {
    next.nextRevisionIndex = Math.max(doc.nextRevisionIndex || 1, state.nextRevisionIndex);
  }
  const pendingRevisions = revisions.filter((r) => r.status !== 'accepted').length;
  return { doc: next, added, pendingRevisions };
}
