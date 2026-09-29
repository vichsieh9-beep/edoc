// Library rows as html strings: rendered at build time (visitors, no script needed) and again
// in the browser (search, archived toggle, admin buttons). Every value is escaped here.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function matches(doc, query) {
  const q = String(query || '').trim().toLowerCase();
  return !q || `${doc.title} ${doc.subtitle || ''}`.toLowerCase().includes(q);
}

function status(doc) {
  if (doc.pending === 'live') return '<span class="state live">✓ 已上線</span>';
  if (doc.pending) return '<span class="state">上線中，約 1～2 分鐘</span>';
  if (doc.archived) return `封存 ${esc(doc.archived.date)}${doc.archived.by ? ' · ' + esc(doc.archived.by) : ''}`;
  if (!doc.updated) return '';
  return `更新 ${esc(doc.updated.date)}${doc.updated.by ? ' · ' + esc(doc.updated.by) : ''}`;
}

export function rowHtml(doc, { admin = false } = {}) {
  const href = `./documents/${esc(doc.slug)}/`;
  const name = doc.archived || doc.pending === true
    ? `<span class="name">${esc(doc.title)}</span>`
    : `<a class="name" href="${href}">${esc(doc.title)}</a>`;
  const tag = doc.archived ? `<span class="tag-arch">已封存</span>` : '';
  const desc = doc.archived ? '網址只顯示「已封存」；所有版本都保留' : doc.subtitle;
  let acts = '';
  if (admin && doc.archived) acts = `<button class="small" data-act="restore">還原</button>`;
  else if (admin && !doc.pending) {
    acts = `<button class="small" data-act="share">分享</button><button class="small more" data-act="more" aria-label="更多動作">⋯</button>`;
  }
  return `<div class="row${doc.archived ? ' archived' : ''}" data-slug="${esc(doc.slug)}">
  <div class="main"><div>${name}${tag}</div>${desc ? `<div class="desc">${esc(desc)}</div>` : ''}</div>
  <span class="ver">${esc(doc.latestVersion)}</span>
  <span class="upd">${status(doc)}</span>
  <span class="acts">${acts}</span>
</div>`;
}

/** Rows to show: archived documents only when asked, filtered by the search text. */
export function rowsHtml(docs, { admin = false, showArchived = false, query = '' } = {}) {
  return docs.filter((d) => (showArchived || !d.archived) && matches(d, query)).map((d) => rowHtml(d, { admin })).join('\n');
}
