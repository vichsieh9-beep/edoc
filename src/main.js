// EDoc runtime entry. Bundled by scripts/build.mjs into each document's single self-contained HTML.
import {clearRevisionSelection} from './ui/revision-navigation.js';
import {openSuggestionList} from './ui/suggestions.js';
import {resumeSuggestionPublication} from './ui/publication-preview.js';
import {openSharingPermissions} from './ui/sharing-permissions.js';
import {collaborationApi,refreshCapabilities} from './ui/access.js';
import { ENGINE_VERSION } from './engine/meta.js';
import { cleanSnapshot, annotateBaseBlocks } from './engine/dom.js';
import { buildFormalDiff, analyzeFormalDiff } from './engine/diff.js';
import { sha256 } from './engine/hash.js';
import { sanitizeRevisionHtml } from './engine/revision.js';
import { versionOrder } from './engine/version.js';
import { listChanges } from './engine/changes.js';
import { usableAiSummary } from './engine/ai-summary.js';
import { toPlainText } from './engine/text.js';
import { el } from './ui/elements.js';
import { state, latestVersion, ensureHash } from './ui/state.js';
import { initDocSurface } from './ui/doc-surface.js';
import { initDraftTracking, startRevision, finishRevision, discardRevision, offerSavedDraft } from './ui/draft.js';
import { initShare } from './ui/share.js';
import { applyCleanState, renderVersion } from './ui/version-view.js';
import { captureEditToken, checkAccess } from './ui/access.js';
import { renderEditBar } from './ui/edit-bar.js';
import { showNotice } from './ui/notice.js';
import { checkForNewerVersion } from './ui/publish-status.js';

el.suggestionsBtn.addEventListener('click',openSuggestionList);
el.permissionsBtn.addEventListener('click',()=>openSharingPermissions({doc:{slug:state.meta.slug,title:state.meta.title},session:state.session,api:collaborationApi,onChanged:refreshCapabilities}));
captureEditToken();
initDocSurface();
initDraftTracking();
initShare();

/* Stable engine surface for tests and tooling (e.g. Phase 4 AI changelog, PDF generation). */
window.EDoc={
  engineVersion: ENGINE_VERSION,
  buildFormalDiff, analyzeFormalDiff, cleanSnapshot, annotateBaseBlocks, sanitizeRevisionHtml, listChanges, usableAiSummary,
  toPlainText, sha256, ensureHash, versionOrder: ()=>versionOrder(state.versions),
  get versions(){ return state.versions; },
};

function fitVersionMenu() {
  if (!el.versionMenu.classList.contains('open')) return;
  const viewport=window.visualViewport;
  const bottom=viewport ? viewport.offsetTop+viewport.height : window.innerHeight;
  const top=el.versionMenu.getBoundingClientRect().top;
  el.versionMenu.style.setProperty('--version-menu-height',`${Math.max(0,bottom-top-16)}px`);
}
el.versionButton.addEventListener('click',e=>{
  e.stopPropagation();el.versionMenu.classList.toggle('open');fitVersionMenu();
});
el.versionMenu.addEventListener('click',e=>e.stopPropagation());
window.addEventListener('resize',fitVersionMenu);
window.visualViewport?.addEventListener('resize',fitVersionMenu);
window.visualViewport?.addEventListener('scroll',fitVersionMenu);
new ResizeObserver(fitVersionMenu).observe(el.versionButton.closest('.read-bar'));
document.addEventListener('click',()=>el.versionMenu.classList.remove('open'));
el.toggleChanges.addEventListener('click',()=>{clearRevisionSelection();state.clean=!state.clean;applyCleanState()});
el.newRevisionBtn.addEventListener('click',()=>startRevision());
el.finishRevisionBtn.addEventListener('click',()=>finishRevision());
el.discardRevisionBtn.addEventListener('click',()=>discardRevision());

// Boot: show the latest version, then check for a newer published copy and for edit access.
(async()=>{
  for(const v of versionOrder(state.versions)) await ensureHash(v);
  await renderVersion(latestVersion());
  const newer=await checkForNewerVersion();
  await checkAccess();
  renderEditBar();
  await resumeSuggestionPublication();
  if(state.linkProblem) showNotice(state.linkProblem,[], 'warn');
  if(state.session && !newer) await offerSavedDraft();
})();
