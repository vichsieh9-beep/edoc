// Read-only view of a formal version: version menu, version card, change highlighting.
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { setDocHtml, leaveRevisionView } from './doc-surface.js';
import { versionOrder } from '../engine/version.js';

export function buildVersionMenu() {
  const { versionMenu }=el;
  versionMenu.innerHTML='';
  versionOrder(state.versions).slice().reverse().forEach(v=>{
    const data=state.versions[v];
    const item=document.createElement('div');
    item.className='version-item'+(!state.activeRevision && v===state.activeVersion?' active':'');
    const row=document.createElement('div'); row.className='version-row';
    const name=document.createElement('span'); name.textContent=v; row.appendChild(name);
    if(v===latestVersion()){ const c=document.createElement('span'); c.className='version-current'; c.textContent='Current'; row.appendChild(c); }
    const sum=document.createElement('div'); sum.className='version-summary'; sum.textContent=data.summary;
    item.append(row,sum);
    item.addEventListener('click',()=>{versionMenu.classList.remove('open'); leaveRevisionView(); renderVersion(v);});
    versionMenu.appendChild(item);
  });
}
function clearUIHighlights() {
  [el.versionControl,el.versionCard,el.toggleChanges,el.editState,el.newRevisionBtn,el.copyBtn,el.exportReviewBtn,
    el.exportRevisionBtn,el.importRevisionBtn,el.acceptRevisionBtn,el.printBtn]
   .forEach(x=>x.classList.remove('ui-changed'));
}
function applyUIHighlights(v) {
  clearUIHighlights();
  const c=state.versions[v].uiChanges||[];
  if(c.includes('revision')) el.newRevisionBtn.classList.add('ui-changed');
  if(c.includes('exportReview')) el.exportReviewBtn.classList.add('ui-changed');
  if(c.includes('exportRevision')) el.exportRevisionBtn.classList.add('ui-changed');
  if(c.includes('importRevision')) el.importRevisionBtn.classList.add('ui-changed');
  if(c.includes('acceptRevision')) el.acceptRevisionBtn.classList.add('ui-changed');
  if(c.includes('hash')) el.versionCard.classList.add('ui-changed');
}
export function applyCleanState() {
  const { clean }=state;
  el.doc.classList.toggle('clean', clean);
  el.toggleChanges.textContent = clean ? '顯示變更：關' : '顯示變更：開';
  el.toggleChanges.classList.toggle('state-blue', !clean);
  el.toggleChanges.classList.toggle('state-gray', clean);
}
export async function renderVersion(v) {
  state.activeVersion=v; state.activeRevision=null; state.suppressObserver=true;
  const data=state.versions[v]; setDocHtml(data.html); state.suppressObserver=false;
  el.doc.contentEditable='false'; el.doc.classList.remove('editing');
  el.editState.textContent='正式版：唯讀'; el.editState.className='state-gray'; el.editState.disabled=true; el.acceptRevisionBtn.textContent='建立新版本';
  el.exportRevisionBtn.disabled=true; el.acceptRevisionBtn.disabled=true; el.newRevisionBtn.disabled=false;
  el.revisionPanel.classList.remove('show','conflict');
  el.versionLabel.textContent=v+(v===latestVersion()?' · Current':'');
  el.cardTitle.textContent=v+'｜版本摘要'; el.cardSummary.textContent=data.summary;
  el.compareBadge.textContent=data.previous?'比較基準：'+data.previous:'第一版';
  el.statusBadge.textContent=v===latestVersion()?'Current':'歷史版・唯讀';
  el.statusBadge.className='badge '+(v===latestVersion()?'current':'readonly');
  el.detailList.innerHTML=''; data.details.forEach(x=>{const li=document.createElement('li');li.textContent=x;el.detailList.appendChild(li);});
  el.versionHash.textContent='SHA-256：'+(await ensureHash(v));
  applyCleanState(); applyUIHighlights(v); buildVersionMenu();
}
