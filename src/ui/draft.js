// Zero-input revision: 開始修訂 opens a Draft on the latest version with no form.
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { setDocHtml, annotateBlocks } from './doc-surface.js';
import { buildVersionMenu } from './version-view.js';
import { renderRevisionPanel } from './revision-panel.js';
import { getEditorName } from './editor-name.js';
import { cleanSnapshot } from '../engine/dom.js';
import { buildFormalDiff, analyzeFormalDiff } from '../engine/diff.js';
import { nowISO } from '../engine/version.js';

export function refreshDraftStats(){
  if(!state.activeRevision) return;
  try{
    const formal=buildFormalDiff(state.versions[state.activeRevision.baseVersion].html,el.doc.innerHTML);
    const stats=analyzeFormalDiff(formal);
    el.revisionSummary.textContent=stats.summary;
  }catch(e){
    el.revisionSummary.textContent='Draft 變更統計將於建立新版本時計算';
  }
}
let statsTimer=null;
function scheduleDraftStats(){
  clearTimeout(statsTimer);
  statsTimer=setTimeout(refreshDraftStats,300);
}
export function initDraftStats(){ el.doc.addEventListener('input',scheduleDraftStats); }

export async function startRevision() {
  const base=latestVersion();
  const baseHash=await ensureHash(base);
  const label='Draft';
  state.activeRevision={
    id:'rev-'+Date.now(), label, baseVersion:base, baseHash,
    author:getEditorName()||'未設定', role:'', summary:'',
    createdAt:nowISO(), status:'draft', html:cleanSnapshot(state.versions[base].html), documentId:state.docState.documentId
  };
  state.revisions.push(state.activeRevision);
  state.suppressObserver=true; setDocHtml(state.activeRevision.html); annotateBlocks(); state.suppressObserver=false;
  el.doc.contentEditable='true'; el.doc.classList.add('editing');
  document.execCommand('defaultParagraphSeparator',false,'p');
  el.editState.textContent='修訂模式：可編輯'; el.editState.className='state-green'; el.editState.disabled=true; el.acceptRevisionBtn.textContent='建立新版本';
  el.versionLabel.textContent='Draft · Base '+base;
  el.exportRevisionBtn.disabled=false; el.acceptRevisionBtn.disabled=false;
  el.newRevisionBtn.disabled=true;
  renderRevisionPanel(); buildVersionMenu(); refreshDraftStats();
}
