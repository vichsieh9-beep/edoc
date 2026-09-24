// Editing area of the header: shown only to holders of a valid edit link.
import { el } from './elements.js';
import { state } from './state.js';
import { updatePdfLink } from './share.js';

export function renderEditBar() {
  const s = state.session, drafting = !!state.activeRevision;
  el.editGroup.hidden = !s;
  el.barRow.classList.toggle('solo', !s);
  if (s) {
    el.whoChip.textContent = '可編輯・' + s.name;
    el.whoChip.hidden = drafting;
    el.stateChip.textContent = drafting ? '修訂中・' + s.name : '正式版・唯讀';
    el.stateChip.classList.toggle('editing', drafting);
    el.newRevisionBtn.hidden = drafting;
    el.finishRevisionBtn.hidden = !drafting;
    el.discardRevisionBtn.hidden = !drafting;
  }
  updatePdfLink();
}
