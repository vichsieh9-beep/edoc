// Editing area of the header: shown only to holders of a valid edit link.
import {capability} from './access.js';
import { el } from './elements.js';
import { state } from './state.js';
import { updatePdfLink } from './share.js';

export function renderEditBar() {
  const s = state.session, drafting = !!state.activeRevision;
  el.permissionsBtn.hidden=!capability('manage');el.suggestionsBtn.hidden=!s?.policy?.policyRevision||!capability('view');
  el.editGroup.hidden = !s;
  el.barRow.classList.toggle('solo', !s);
  const suggestion=state.suggestion;
  const reviewing=state.privateView==='suggestion'&&s?.policy?.enabled&&suggestion?.status!=='withdrawn';
  const eligible=suggestion?.items.some(i=>i.decision==='adopt'&&!i.publishedIn&&!i.lockedBy);
  el.publishSuggestionBtn.hidden=!(reviewing&&capability('publish'));
  el.publishSuggestionBtn.disabled=!!state.collaborationBusy||!eligible;
  el.publishSuggestionBtn.title=eligible?'先預覽採納內容，確認後才發布新版':'尚無可發布的採納內容';
  el.publishSuggestionBtn.onclick=async()=>{const {previewCurrentSuggestion}=await import('./suggestions.js');await previewCurrentSuggestion();};
  if (s) {
    el.whoChip.textContent = '可編輯・' + s.name;
    el.whoChip.hidden = drafting;
    el.stateChip.textContent = drafting ? '修訂中・' + s.name : state.privateView === 'preview' ? '採納預覽・尚未發布' : state.privateView === 'suggestion' ? '修訂建議・唯讀' : '正式版・唯讀';
    el.stateChip.classList.toggle('editing', drafting);
    el.newRevisionBtn.hidden = drafting||!!state.privateView||!capability('propose');
    el.finishRevisionBtn.hidden = !drafting;el.finishRevisionBtn.disabled=!capability('propose');el.finishRevisionBtn.textContent=s.policy?.enabled?'送出修訂建議':'完成修訂-版本更新';
    el.discardRevisionBtn.hidden = !drafting;
  }
  updatePdfLink();
}
