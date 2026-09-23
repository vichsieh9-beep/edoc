// EDoc runtime entry. Bundled by scripts/build.mjs into each document's single self-contained HTML.
import { ENGINE_VERSION } from './engine/meta.js';
import { cleanSnapshot, annotateBaseBlocks } from './engine/dom.js';
import { buildFormalDiff, analyzeFormalDiff } from './engine/diff.js';
import { sha256 } from './engine/hash.js';
import { sanitizeRevisionHtml } from './engine/revision.js';
import { versionOrder } from './engine/version.js';
import { listChanges } from './engine/changes.js';
import { usableAiSummary } from './engine/ai-summary.js';
import { el } from './ui/elements.js';
import { state, latestVersion, ensureHash } from './ui/state.js';
import { initEditorDialog, refreshEditorButton } from './ui/editor-name.js';
import { initDocSurface, setDocHtml } from './ui/doc-surface.js';
import { initDraftStats, startRevision } from './ui/draft.js';
import { initPublishBar } from './ui/publish-bar.js';
import { applyCleanState, buildVersionMenu, renderVersion } from './ui/version-view.js';
import { renderRevisionPanel } from './ui/revision-panel.js';
import { exportReviewHTML, exportRevisionPackage, importRevisionText, acceptRevision } from './ui/revision-io.js';

initEditorDialog();
initDocSurface();
initDraftStats();
initPublishBar();

/* Stable engine surface for tests and tooling (e.g. Phase 4 AI changelog). */
window.EDoc={
  engineVersion: ENGINE_VERSION,
  buildFormalDiff, analyzeFormalDiff, cleanSnapshot, annotateBaseBlocks, sanitizeRevisionHtml, listChanges, usableAiSummary,
  sha256, ensureHash, versionOrder: ()=>versionOrder(state.versions),
  get versions(){ return state.versions; },
};

el.versionButton.addEventListener('click',e=>{e.stopPropagation();el.versionMenu.classList.toggle('open')});
document.addEventListener('click',()=>el.versionMenu.classList.remove('open'));
el.toggleChanges.addEventListener('click',()=>{state.clean=!state.clean;applyCleanState()});
el.newRevisionBtn.addEventListener('click',startRevision);
el.copyBtn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(el.doc.innerText);const old=el.copyBtn.textContent;el.copyBtn.textContent='已複製';setTimeout(()=>el.copyBtn.textContent=old,1200)}catch(e){alert('瀏覽器未允許直接複製')}});
el.exportReviewBtn.addEventListener('click',exportReviewHTML);
el.exportRevisionBtn.addEventListener('click',exportRevisionPackage);
el.importRevisionBtn.addEventListener('click',()=>el.importFile.click());
el.importFile.addEventListener('change',async()=>{const f=el.importFile.files[0];if(!f)return;try{await importRevisionText(await f.text(),f.name)}catch(e){alert('匯入失敗：'+e.message)}finally{el.importFile.value=''}});
el.acceptRevisionBtn.addEventListener('click',acceptRevision);

// Boot: hash every version, then reopen a Draft saved in an exported review HTML, or show Current.
(async()=>{
  refreshEditorButton();
  for(const v of versionOrder(state.versions)) await ensureHash(v);
  const reopenId=state.docState.openRevisionId;
  if(reopenId){
    const r=state.revisions.find(x=>x.id===reopenId && x.status!=='accepted');
    if(r){
      state.activeRevision=r;
      state.suppressObserver=true; setDocHtml(r.html); state.suppressObserver=false;
      el.doc.contentEditable = r.status==='draft' ? 'true' : 'false';
      el.doc.classList.toggle('editing', r.status==='draft');
      el.editState.textContent = r.status==='draft' ? '修訂模式：可編輯' : '匯入修訂：審閱中';
      el.editState.className = r.status==='draft' ? 'state-green' : 'state-gray';
      el.versionLabel.textContent=r.status==='imported' ? 'Imported Revision · Base '+r.baseVersion : 'Draft · Base '+r.baseVersion;
      el.newRevisionBtn.disabled=true;
      el.exportRevisionBtn.disabled=false;
      await renderRevisionPanel();
      buildVersionMenu();
      applyCleanState();
      return;
    }
  }
  await renderVersion(latestVersion());
})();
