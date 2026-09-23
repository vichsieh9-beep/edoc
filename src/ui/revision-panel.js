// Panel shown while a Draft or an imported revision is open.
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { isRevisionConflict } from '../engine/revision.js';

function escapeHtml(t) { const d=document.createElement('div'); d.textContent=t; return d.innerHTML; }

export async function revisionHasConflict(r) {
  return isRevisionConflict(r,{
    documentId: state.docState.documentId,
    latestVersion: latestVersion(),
    latestHash: await ensureHash(latestVersion()),
  });
}
export async function renderRevisionPanel() {
  const r=state.activeRevision;
  if(!r){el.revisionPanel.classList.remove('show','conflict');return;}
  el.revisionPanel.classList.add('show');
  const conflict=await revisionHasConflict(r);
  el.revisionPanel.classList.toggle('conflict',conflict);
  el.revisionTitle.textContent=r.status==='imported' ? 'Imported Revision' : 'Draft';
  el.revisionBase.textContent='Base '+r.baseVersion;
  el.revisionStatus.textContent=conflict?'Conflict':(r.status==='imported'?'Imported':'Draft');
  if(r.status==='imported' && r.summary) el.revisionSummary.textContent=r.summary;
  el.revisionMeta.innerHTML='<span>編輯者：'+escapeHtml(r.author||'未設定')+'</span><span>開始時間：'+escapeHtml(r.createdAt)+'</span>';
  el.revisionHash.textContent='Base SHA-256：'+r.baseHash;
  el.acceptRevisionBtn.disabled=conflict;
}
