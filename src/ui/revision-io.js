// Export / import of revisions and acceptance of a Draft as the next formal version.
import { el } from './elements.js';
import { state, latestVersion } from './state.js';
import { setDocHtml } from './doc-surface.js';
import { renderVersion, buildVersionMenu } from './version-view.js';
import { renderRevisionPanel, revisionHasConflict } from './revision-panel.js';
import { refreshEditorButton } from './editor-name.js';
import { buildFormalDiff, analyzeFormalDiff } from '../engine/diff.js';
import { snapshotHash } from '../engine/hash.js';
import { nextVersion, nowISO } from '../engine/version.js';
import { sanitizeRevisionHtml, parseRevisionFile, makeRevisionPackage } from '../engine/revision.js';

const embed=v=>JSON.stringify(v).replace(/<\//g,'<\\/');

export function syncEmbeddedState() {
  if(state.activeRevision) state.activeRevision.html=el.doc.innerHTML;
  state.docState.openRevisionId = state.activeRevision ? state.activeRevision.id : null;
  document.getElementById('versionData').textContent=embed(state.versions);
  document.getElementById('documentState').textContent=embed(state.docState);
  document.getElementById('revisionData').textContent=embed(state.revisions);
}
function downloadBlob(name, content, type) {
  const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
export function exportReviewHTML() {
  syncEmbeddedState();
  const serialized='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  const name=state.meta.reviewFileName || state.docState.documentId+'.edoc-review.html';
  downloadBlob(name, serialized, 'text/html;charset=utf-8');
}
export function exportRevisionPackage() {
  const r=state.activeRevision;
  if(!r) return;
  r.html=el.doc.innerHTML;
  const pkg=makeRevisionPackage(state.docState.documentId,r);
  downloadBlob(r.label.replace(/\s+/g,'_')+'.edoc-revision.json', JSON.stringify(pkg,null,2), 'application/json;charset=utf-8');
}
export async function importRevisionText(text, filename) {
  const pkg=parseRevisionFile(text, filename);
  const r=pkg.revision;
  r.html=sanitizeRevisionHtml(r.html);
  r.status='imported';
  if(!r.documentId) r.documentId=pkg.documentId;
  state.revisions.push(r); state.activeRevision=r;
  state.suppressObserver=true; setDocHtml(r.html); state.suppressObserver=false;
  el.doc.contentEditable='false'; el.doc.classList.remove('editing');
  el.editState.textContent='匯入修訂：審閱中'; el.editState.className='state-gray'; el.acceptRevisionBtn.textContent='接受為新版本';
  el.versionLabel.textContent='Imported Revision · Base '+r.baseVersion;
  el.exportRevisionBtn.disabled=false;
  await renderRevisionPanel();
  buildVersionMenu();
}
export async function acceptRevision() {
  const r=state.activeRevision;
  if(!r || await revisionHasConflict(r)) return;
  r.html=el.doc.innerHTML;
  const oldLatest=latestVersion(); const newV=nextVersion(oldLatest);
  const formalDiffHtml=buildFormalDiff(state.versions[oldLatest].html, r.html);
  const stats=analyzeFormalDiff(formalDiffHtml);

  if(stats.summary==='未偵測到內容變更'){
    alert('沒有偵測到內容變更，因此不建立新版本。');
    return;
  }

  state.versions[newV]={
    summary:stats.summary,
    details:[
      ...stats.details,
      '基準版本：'+r.baseVersion,
      '編輯者：'+(r.author||'未設定'),
      '建立時間：'+nowISO()
    ],
    previous:oldLatest,
    html:formalDiffHtml,
    uiChanges:[],
    hash:await snapshotHash(formalDiffHtml),
    aiSummary:null
  };
  r.status='accepted';
  state.docState.latestVersion=newV;
  state.activeRevision=null;
  await renderVersion(newV);
  syncEmbeddedState();
  refreshEditorButton();
  alert('已建立 '+newV+'。版本摘要與 Changelog 已依實際 Diff 自動產生。');
}
