// Revising: 開始修訂 opens a Draft on the latest version (no form). The draft is saved in this
// browser as you type; 完成修訂-版本更新 publishes it as the next formal version.
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { setDocHtml, annotateBlocks } from './doc-surface.js';
import { buildVersionMenu, renderVersion } from './version-view.js';
import { renderRevisionPanel } from './revision-panel.js';
import { renderEditBar } from './edit-bar.js';
import { openDialog } from './dialog.js';
import { showNotice, hideNotice } from './notice.js';
import { api } from './access.js';
import { markPublishing } from './publish-status.js';
import { readStore, writeStore, removeStore } from './storage.js';
import { localDateTime, downloadText } from './format.js';
import { cleanSnapshot } from '../engine/dom.js';
import { buildFormalDiff, analyzeFormalDiff } from '../engine/diff.js';
import { sanitizeRevisionHtml, makeRevisionPackage } from '../engine/revision.js';
import { nextVersion, nowISO } from '../engine/version.js';

const draftKey = () => 'edoc-draft:' + state.docState.documentId;
export function savedDraft() {
  try { return JSON.parse(readStore(draftKey()) || 'null'); } catch { return null; }
}
function saveDraftNow() {
  const r = state.activeRevision;
  if (!r) return;
  r.html = el.doc.innerHTML;
  writeStore(draftKey(), JSON.stringify({ baseVersion: r.baseVersion, html: r.html, savedAt: nowISO() }));
}
let saveTimer = null;
function clearSavedDraft() { clearTimeout(saveTimer); removeStore(draftKey()); }

export function refreshDraftStats() {
  if (!state.activeRevision) return;
  try {
    const formal = buildFormalDiff(state.versions[state.activeRevision.baseVersion].html, el.doc.innerHTML);
    el.revisionSummary.textContent = analyzeFormalDiff(formal).summary;
  } catch (e) {
    el.revisionSummary.textContent = 'Draft 變更統計將於完成修訂時計算';
  }
}
let statsTimer = null;
export function initDraftTracking() {
  el.doc.addEventListener('input', () => {
    clearTimeout(statsTimer);
    statsTimer = setTimeout(refreshDraftStats, 300);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, 600);
  });
  addEventListener('pagehide', saveDraftNow);
}

export function downloadBackup(revision) {
  const pkg = makeRevisionPackage(state.docState.documentId, revision);
  downloadText(`${state.meta.title}_${revision.baseVersion}_修改備份.json`, JSON.stringify(pkg, null, 2), 'application/json;charset=utf-8');
}

// Starts a Draft; a draft saved in this browser on the same base version is resumed.
export async function startRevision() {
  if (!state.session) return;
  const base = latestVersion();
  const saved = savedDraft();
  const resume = saved && saved.baseVersion === base ? saved : null;
  state.activeRevision = {
    id: 'rev-' + Date.now(), label: 'Draft', baseVersion: base, baseHash: await ensureHash(base),
    author: state.session.name, role: '', summary: '', createdAt: nowISO(), status: 'draft',
    html: resume ? sanitizeRevisionHtml(resume.html) : cleanSnapshot(sanitizeRevisionHtml(state.versions[base].html)),
    documentId: state.docState.documentId,
  };
  state.revisions.push(state.activeRevision);
  state.suppressObserver = true; setDocHtml(state.activeRevision.html); annotateBlocks(); state.suppressObserver = false;
  el.doc.contentEditable = 'true'; el.doc.classList.add('editing');
  document.execCommand('defaultParagraphSeparator', false, 'p');
  el.versionLabel.textContent = 'Draft · Base ' + base;
  renderRevisionPanel(); buildVersionMenu(); refreshDraftStats(); renderEditBar();
  if (resume) {
    showNotice(`已恢復你上次未完成的修訂（${localDateTime(resume.savedAt)} 暫存）`, [{ label: '捨棄', onClick: () => discardRevision() }]);
  }
}

// A saved draft whose base is no longer the latest version cannot be resumed automatically.
export async function offerSavedDraft() {
  const saved = savedDraft();
  if (!saved) return;
  if (saved.baseVersion === latestVersion()) return startRevision();
  showNotice(`你上次未完成的修改是根據 ${saved.baseVersion}，但文件已更新到 ${latestVersion()}，無法自動接續。`, [
    { label: '下載修改備份', onClick: () => downloadBackup({ baseVersion: saved.baseVersion, html: saved.html, author: state.session && state.session.name, createdAt: saved.savedAt, status: 'draft' }) },
    { label: '捨棄', onClick: () => { clearSavedDraft(); hideNotice(); } },
  ], 'warn');
}

export async function discardRevision({ confirm = true } = {}) {
  if (!state.activeRevision) return;
  if (confirm) {
    const choice = await openDialog({
      title: '放棄這次的修改？', note: '修改的內容會被刪除，無法復原。',
      actions: [{ label: '繼續修改', value: null }, { label: '放棄修改', value: 'discard', primary: true }],
    });
    if (choice !== 'discard') return;
  }
  clearSavedDraft();
  state.revisions = state.revisions.filter((r) => r !== state.activeRevision);
  hideNotice();
  await renderVersion(latestVersion());
}

function setBusy(busy) {
  el.finishRevisionBtn.disabled = busy;
  el.discardRevisionBtn.disabled = busy;
  el.finishRevisionBtn.textContent = busy ? '發布中…' : '完成修訂-版本更新';
}

async function publishFailed(error, revision) {
  const choice = await openDialog({
    title: '發布沒有成功', note: error.message,
    actions: [{ label: '下載修改備份', value: 'backup' }, { label: '關閉', value: null, primary: true }],
  });
  if (choice === 'backup') downloadBackup(revision);
}

export async function finishRevision() {
  const r = state.activeRevision;
  if (!r || !state.session) return;
  r.html = el.doc.innerHTML;
  const base = latestVersion();
  const key = nextVersion(base);
  // The formal diff is recomputed from the base snapshot and the draft snapshot.
  const html = buildFormalDiff(state.versions[base].html, r.html);
  const stats = analyzeFormalDiff(html);
  if (stats.summary === '未偵測到內容變更') {
    alert('沒有偵測到內容變更，因此不建立新版本。');
    return;
  }
  const choice = await openDialog({
    title: `完成修訂-版本更新 ${key}`,
    summary: `Base ${base}｜${stats.summary}`,
    note: '按「發布」後，新版本會存進正式文件，約 2～3 分鐘後公開網址更新；有編輯權限的人都看得到。',
    actions: [{ label: '取消', value: null }, { label: '發布', value: 'publish', primary: true }],
  });
  if (choice !== 'publish') return;
  saveDraftNow();
  const version = {
    summary: stats.summary,
    details: [...stats.details, '基準版本：' + base, '編輯者：' + state.session.name, '建立時間：' + nowISO()],
    previous: base, html, uiChanges: [], aiSummary: null,
  };
  setBusy(true);
  try {
    await api('/versions', { token: state.session.token, doc: state.meta.slug, baseVersion: base, versionKey: key, version });
  } catch (e) {
    setBusy(false);
    return publishFailed(e, r);
  }
  setBusy(false);
  clearSavedDraft();
  hideNotice();
  state.versions[key] = version;
  state.docState.latestVersion = key;
  r.status = 'accepted';
  markPublishing(key);
  await renderVersion(key);
}
