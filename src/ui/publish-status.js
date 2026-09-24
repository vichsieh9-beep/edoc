// After publishing: "發布中…" until the redeployed public page carries the new version, then "✓ 已上線".
import { el } from './elements.js';
import { state } from './state.js';
import { showNotice } from './notice.js';

const POLL_MS = () => window.__EDOC_POLL_MS || 10000;
const TIMEOUT_MS = 10 * 60 * 1000;
const num = (v) => parseFloat(String(v).slice(1));

async function latestOnSite() {
  const res = await fetch(location.pathname + '?edoc-check=' + Date.now(), { cache: 'no-store' });
  const m = (await res.text()).match(/<script id="documentState" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]).latestVersion : null;
}

export function renderPublishState(v) {
  const p = state.publishing;
  const show = !!p && p.version === v;
  el.publishBadge.hidden = !show;
  el.publishNote.hidden = !show;
  if (!show) return;
  const live = p.status === 'live';
  el.publishBadge.textContent = live ? '✓ 已上線' : '發布中…';
  el.publishBadge.classList.toggle('live', live);
  el.publishNote.classList.toggle('live', live);
  el.publishNote.textContent = live
    ? '公開網址已更新，可以用 LINE 通知對方了。'
    : p.status === 'timeout'
      ? '已存進正式文件，但還沒偵測到公開網址更新；請稍後重新整理確認。'
      : '已存進正式文件，公開網址更新中（約 2～3 分鐘）。這個頁面可以先關掉，不影響發布。';
}

async function poll() {
  const p = state.publishing;
  if (!p || p.status !== 'publishing') return;
  try {
    const live = await latestOnSite();
    if (live && num(live) >= num(p.version)) {
      p.status = 'live';
      renderPublishState(state.activeVersion);
      return;
    }
  } catch {}
  if (Date.now() - p.since > TIMEOUT_MS) {
    p.status = 'timeout';
    renderPublishState(state.activeVersion);
    return;
  }
  setTimeout(poll, POLL_MS());
}

export function markPublishing(version) {
  state.publishing = { version, status: 'publishing', since: Date.now() };
  setTimeout(poll, POLL_MS());
}

// The page may be a cached copy while someone else already published: offer a reload.
export async function checkForNewerVersion() {
  if (!/^https?:$/.test(location.protocol)) return null;
  try {
    const live = await latestOnSite();
    if (live && num(live) > num(state.docState.latestVersion)) {
      showNotice(`已經有更新的版本 ${live}。`, [{ label: '重新整理', onClick: () => location.replace(location.pathname + '?v=' + Date.now()) }]);
      return live;
    }
  } catch {}
  return null;
}
