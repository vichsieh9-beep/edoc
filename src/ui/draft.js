// Revising: 開始修訂 opens a Draft on the latest version (no form). The draft is saved in this
// browser as you type; 完成修訂-版本更新 publishes it as the next formal version.
import { renderRevisionMarkup } from './revision-markup.js';
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { setDocHtml, annotateBlocks, draftSurfaceHtml } from './doc-surface.js';
import { buildVersionMenu, renderVersion } from './version-view.js';
import { renderRevisionPanel } from './revision-panel.js';
import { renderEditBar } from './edit-bar.js';
import { openDialog } from './dialog.js';
import { showNotice, hideNotice } from './notice.js';
import {submitActiveDraft} from './suggestions.js';
import {prepareSuggestionContent} from '../engine/suggestion-patches.js';
import {sha256} from '../engine/hash.js';
import {refreshCapabilities,capability} from './access.js';
import { api } from './access.js';
import { markPublishing } from './publish-status.js';
import { readStore, writeStore, removeStore } from './storage.js';
import { localDateTime, downloadText } from './format.js';
import { cleanSnapshot } from '../engine/dom.js';
import { buildFormalDiff, analyzeFormalDiff } from '../engine/diff.js';
import { sanitizeRevisionHtml, makeRevisionPackage } from '../engine/revision.js';
import { nextVersion, nowISO } from '../engine/version.js';
import { canonicalLayout, layoutChanges, layoutChangeLine } from '../engine/layout.js';

const draftKey = () => 'edoc-draft:' + state.docState.documentId;
export function savedDraft() {
  try { return JSON.parse(readStore(draftKey()) || 'null'); } catch { return null; }
}
export function saveDraftNow() {
  const r = state.activeRevision;
  if (!r) return;
  unsaved = false;
  r.html = draftSurfaceHtml();
  writeStore(draftKey(), JSON.stringify({ baseVersion: r.baseVersion, html: r.html, layout: r.layout, restoredFrom: r.restoredFrom, savedAt: nowISO(), sourceSuggestionId:r.sourceSuggestionId,sourceItemIds:r.sourceItemIds,suggestionRequest:r.suggestionRequest }));
}
// What a draft changes: its words (the formal diff) and its document format (R2.17).
export function draftSummary(stats, r = state.activeRevision) {
  const changes = layoutChanges(state.versions[r.baseVersion].layout, r.layout);
  const line = changes.length ? layoutChangeLine(changes) : null;
  let summary = !line ? stats.summary : stats.summary === '未偵測到內容變更' ? line : stats.summary + '；' + line;
  // A draft started from a historical version says so (R2.18).
  if (r.restoredFrom && summary !== '未偵測到內容變更') summary = `還原 ${r.restoredFrom}：` + summary;
  return { summary, line };
}
let saveTimer = null, unsaved = false;
export function clearSavedDraft() { clearTimeout(saveTimer); removeStore(draftKey()); }

export function refreshDraftStats(force=false) {
  if (!state.activeRevision) return;
  try {
    const formal = buildFormalDiff(state.versions[state.activeRevision.baseVersion].html, el.doc.innerHTML);
    el.revisionSummary.textContent = draftSummary(analyzeFormalDiff(formal)).summary;
    renderRevisionMarkup(formal,{force});
  } catch (e) {
    el.revisionSummary.textContent = 'Draft 變更統計將於完成修訂時計算';
  }
}
let statsTimer = null;
export function initDraftTracking() {
  let composing=false;
  el.doc.addEventListener('compositionstart',()=>{ composing=true;state.composing=true; clearTimeout(statsTimer); });
  el.doc.addEventListener('compositionend',()=>{ composing=false;state.composing=false; refreshDraftStats(true); });
  el.doc.addEventListener('edoc-markup-invalidated',()=>{clearTimeout(statsTimer);if(!composing)statsTimer=setTimeout(refreshDraftStats,150);});
  el.doc.addEventListener('input', () => {
    clearTimeout(statsTimer);
    // Wait for the native edit/undo transaction to finish, but restore
    // comparison fragments before painting rather than after a 150 ms gap.
    if(!composing) queueMicrotask(()=>{if(!state.composing)refreshDraftStats();});
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraftNow, 600);
    unsaved = true;
  });
  addEventListener('pagehide', saveDraftNow);
  // The document format dialog changed the draft's layout.
  el.doc.addEventListener('edoc-layout-changed', () => { saveDraftNow(); refreshDraftStats(); });
  // Typing not saved yet when the draft is left for another version.
  el.doc.addEventListener('edoc-draft-leaving', () => { if (unsaved) { clearTimeout(saveTimer); saveDraftNow(); } });
}

export function downloadBackup(revision) {
  const pkg = makeRevisionPackage(state.docState.documentId, revision);
  downloadText(`${state.meta.title}_${revision.baseVersion}_修改備份.json`, JSON.stringify(pkg, null, 2), 'application/json;charset=utf-8');
}

// Starts a Draft; a draft saved in this browser on the same base version is resumed.
export async function startRevision(options={}) {
  if(state.session?.policy?.enabled){await refreshCapabilities();if(!capability('propose'))return;}
  state.privateView=null;el.versionCard.hidden=false;
  if (!state.session) return;
  const base = latestVersion();
  const saved = savedDraft();
  const resume = saved && saved.baseVersion === base ? saved : null;
  state.activeRevision = {
    id: 'rev-' + Date.now(), label: 'Draft', baseVersion: base, baseHash: state.session.policy?.enabled ? await sha256(prepareSuggestionContent(cleanSnapshot(state.versions[base].html))) : await ensureHash(base),
    author: state.session.name, role: '', summary: '', createdAt: nowISO(), status: 'draft',
    sourceSuggestionId:options.sourceSuggestionId||resume?.sourceSuggestionId,sourceItemIds:options.sourceItemIds||resume?.sourceItemIds,suggestionRequest:resume?.suggestionRequest,
    html: options.html || (resume ? sanitizeRevisionHtml(resume.html) : cleanSnapshot(sanitizeRevisionHtml(state.versions[base].html))),
    // The document format starts as the base version's; a resumed draft keeps its own.
    layout: canonicalLayout('layout' in options ? options.layout : resume && !options.html ? resume.layout : state.versions[base].layout),
    restoredFrom: options.restoredFrom || (options.html ? undefined : resume?.restoredFrom),
    documentId: state.docState.documentId,
  };
  state.revisions.push(state.activeRevision);
  state.suppressObserver = true; setDocHtml(state.activeRevision.html, state.activeRevision.layout); annotateBlocks(); state.suppressObserver = false;
  el.doc.contentEditable = 'true'; el.doc.classList.add('editing');
  document.execCommand('defaultParagraphSeparator', false, 'p');
  el.versionLabel.textContent = 'Draft · Base ' + base;
  renderRevisionPanel(); buildVersionMenu(); refreshDraftStats(); renderEditBar();
  if (resume) {
    showNotice(`已恢復你上次未完成的修訂（${localDateTime(resume.savedAt)} 暫存）`, [{ label: '捨棄', onClick: () => discardRevision() }]);
  }
  return state.activeRevision;
}

// 以這版內容修訂 (R2.18, after Pages' "restore an earlier version"): a draft whose content and
// document format are those of historical version `v`, compared with the latest version as
// usual. Publishing it makes a new version; no version is ever changed.
export async function restoreVersion(v) {
  const base = latestVersion(), old = state.versions[v];
  if (!old || v === base || !state.session) return;
  const saved = savedDraft();
  const note = `會開一份草稿，內容與文件格式換回 ${v}，並標出跟 ${base} 不同的地方；草稿裡還可以再修改。按「完成修訂-版本更新」才會發布，所有歷史版本都不會被更動。`
    + (saved ? `你有一份還沒完成的修改（基準 ${saved.baseVersion}），開始後會被取代，可先下載備份。` : '');
  const actions = saved
    ? [{ label: '取消', value: null }, { label: '下載修改備份', value: 'backup' }, { label: '取代並開始修訂', value: 'go', primary: true }]
    : [{ label: '取消', value: null }, { label: '開始修訂', value: 'go', primary: true }];
  for (;;) {
    const choice = await openDialog({ title: `以 ${v} 的內容開始修訂？`, summary: `比較基準：目前的 ${base}｜發布後成為 ${nextVersion(base)}`, note, actions });
    if (choice === 'backup') { downloadBackup({ baseVersion: saved.baseVersion, html: saved.html, author: state.session.name, createdAt: saved.savedAt, status: 'draft' }); continue; }
    if (choice !== 'go') return;
    break;
  }
  clearSavedDraft();
  hideNotice();
  // The draft is based on the latest version: its card is the one shown above the draft.
  await renderVersion(base);
  return startRevision({ html: cleanSnapshot(sanitizeRevisionHtml(old.html)), layout: old.layout || null, restoredFrom: v });
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
  r.html = draftSurfaceHtml();saveDraftNow();
  if(state.session.policy?.enabled){await refreshCapabilities();if(!capability('propose')){showNotice('提出修訂權限已調整；草稿已保留。',[], 'warn');return;}}
  if(state.session?.policy?.enabled)return submitActiveDraft();
  const base = r.baseVersion;
  const key = nextVersion(base);
  // The formal diff is recomputed from the base snapshot and the draft snapshot.
  const html = buildFormalDiff(state.versions[base].html, r.html);
  const stats = analyzeFormalDiff(html);
  const { summary, line } = draftSummary(stats, r);
  if (summary === '未偵測到內容變更') {
    alert('沒有偵測到內容變更，因此不建立新版本。');
    return;
  }
  const choice = await openDialog({
    title: `完成修訂-版本更新 ${key}`,
    summary: `Base ${base}｜${summary}`,
    note: '按「發布」後，新版本會存進正式文件，約 2～3 分鐘後公開網址更新；有編輯權限的人都看得到。',
    actions: [{ label: '取消', value: null }, { label: '發布', value: 'publish', primary: true }],
  });
  if (choice !== 'publish') return;
  saveDraftNow();
  const layout = canonicalLayout(r.layout);
  const version = {
    summary,
    details: [...stats.details, ...(line ? [line] : []), ...(r.restoredFrom ? ['還原自：' + r.restoredFrom] : []), '基準版本：' + base, '編輯者：' + state.session.name, '建立時間：' + nowISO()],
    previous: base, html, ...(layout ? { layout } : {}), uiChanges: [], aiSummary: null,
  };
  setBusy(true);
  try {
    const stored = await api('/versions', { token: state.session.token, doc: state.meta.slug, baseVersion: base, versionKey: key, version });
    // The Worker stores the html through the same content model; show exactly what was stored.
    if (typeof stored?.html === 'string') version.html = stored.html;
    if (stored && 'layout' in stored) { if (stored.layout) version.layout = stored.layout; else delete version.layout; }
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
