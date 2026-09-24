// Panel shown while a Draft is open.
import { el } from './elements.js';
import { state } from './state.js';
import { localDateTime } from './format.js';

export function renderRevisionPanel() {
  const r=state.activeRevision;
  if(!r){ el.revisionPanel.classList.remove('show'); return; }
  el.revisionPanel.classList.add('show');
  el.revisionBase.textContent='Base '+r.baseVersion;
  const span=t=>Object.assign(document.createElement('span'),{textContent:t});
  el.revisionMeta.replaceChildren(span('編輯者：'+(r.author||'未設定')), span('開始時間：'+localDateTime(r.createdAt)));
  el.revisionHash.textContent='Base SHA-256：'+r.baseHash;
}
