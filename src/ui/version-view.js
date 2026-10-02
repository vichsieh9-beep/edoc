// Read-only view of a formal version: version menu, version card, change highlighting.
import { renderRevisionMarkup } from './revision-markup.js';
import { el } from './elements.js';
import { state, latestVersion, ensureHash } from './state.js';
import { setDocHtml, leaveRevisionView } from './doc-surface.js';
import { versionOrder } from '../engine/version.js';
import { usableAiSummary, AI_PLACEHOLDER_PREFIX } from '../engine/ai-summary.js';
import { sanitizeRevisionHtml } from '../engine/revision.js';
import { renderEditBar } from './edit-bar.js';
import { renderPublishState } from './publish-status.js';
import { localDateTime } from './format.js';
import { analyzeFormalDiff } from '../engine/diff.js';
import {refreshRevisionNavigation} from './revision-navigation.js';

function aiChip() {
  const c=document.createElement('span'); c.className='ai-chip'; c.textContent='AI'; return c;
}
// Keep metadata available internally; the card presents only totals and meaning.
function renderAiSummary(data) {
  const stats=analyzeFormalDiff(data.html);
  el.cardSummary.textContent=`統計：${stats.modifiedBlocks} 處修改、${stats.addedBlocks} 處新增、${stats.deletedBlocks} 處刪除。`;
  const ai=usableAiSummary(data);
  el.cardMeaning.textContent=ai?.summary || (data.previous ? '變更說明尚未補寫' : data.summary);
}

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
    const sum=document.createElement('div'); sum.className='version-summary';
    const ai=usableAiSummary(data);
    if(ai) sum.append(aiChip(), document.createTextNode(ai.summary)); else sum.textContent=data.summary;
    item.append(row,sum);
    item.addEventListener('click',()=>{versionMenu.classList.remove('open'); leaveRevisionView(); renderVersion(v);});
    versionMenu.appendChild(item);
  });
}
export function applyCleanState() {
  const { clean }=state;
  el.doc.classList.toggle('clean', clean);
  el.toggleChanges.textContent = clean ? '簡單標記' : '所有標記';
  el.toggleChanges.classList.toggle('on', !clean);
  el.toggleChanges.classList.toggle('off', clean);
  el.toggleChanges.setAttribute('aria-label',clean ? '簡單標記，切換所有標記' : '所有標記，切換簡單標記');
  if(state.privateView){const panel=document.getElementById('revisionMarkup');if(panel)panel.hidden=false;document.getElementById('documentReview').classList.remove('simple-markup');refreshRevisionNavigation();return;}
  renderRevisionMarkup();
}
export async function renderVersion(v) {
  state.privateView=null;state.suggestion=null;el.versionCard.hidden=false;document.getElementById('publicationPreview')?.remove();
  document.getElementById('revisionMarkup')?.removeAttribute('data-private');document.getElementById('revisionMarkup')?.removeAttribute('data-suggestion-panel');
  state.activeVersion=v; state.activeRevision=null; state.suppressObserver=true;
  // Stored html is filtered before display, so even a leaked edit link cannot inject script.
  const data=state.versions[v]; setDocHtml(sanitizeRevisionHtml(data.html)); state.suppressObserver=false;
  el.doc.contentEditable='false'; el.doc.classList.remove('editing');
  el.revisionPanel.classList.remove('show');
  el.versionLabel.textContent=v+(v===latestVersion()?' · Current':'');
  el.cardTitle.textContent=v+'｜版本摘要'; el.cardSummary.textContent=data.summary;
  el.compareBadge.textContent=data.previous?'比較基準：'+data.previous:'第一版';
  el.statusBadge.textContent=v===latestVersion()?'Current':'歷史版・唯讀';
  el.statusBadge.className='badge '+(v===latestVersion()?'current':'readonly');
  el.detailList.innerHTML=''; data.details.forEach(x=>{
    const li=document.createElement('li');
    if(x.startsWith(AI_PLACEHOLDER_PREFIX)) {
      li.className='pending-summary';
      li.textContent='變更說明尚未補寫';
    } else {
      li.textContent=x.startsWith('建立時間：') ? '建立時間：'+localDateTime(x.slice('建立時間：'.length))+'（台北時間）' : x;
    }
    el.detailList.appendChild(li);
  });
  el.versionHash.textContent='SHA-256：'+(await ensureHash(v));
  renderAiSummary(data);
  renderPublishState(v);
  applyCleanState(); buildVersionMenu(); renderEditBar();
}
