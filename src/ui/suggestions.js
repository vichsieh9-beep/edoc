import {h,openModal} from '../library/modal.js';
import {state,latestVersion} from './state.js';
import {el} from './elements.js';
import {collaborationApi,capability,refreshCapabilities} from './access.js';
import {renderSuggestionView,renderSuggestionHistory} from './suggestion-view.js';
import {buildFormalDiff} from '../engine/diff.js';
import {sanitizeRevisionHtml} from '../engine/revision.js';
import {prepareSuggestionContent} from '../engine/suggestion-patches.js';
import {sha256} from '../engine/hash.js';
import {cleanSnapshot} from '../engine/dom.js';
import {setDocHtml} from './doc-surface.js';
import {renderVersion,applyCleanState} from './version-view.js';
import {renderEditBar} from './edit-bar.js';
import {updatePdfLink} from './share.js';
import {showNotice} from './notice.js';
import {saveDraftNow,clearSavedDraft,startRevision,savedDraft,downloadBackup} from './draft.js';
import {openPublicationPreview,trackSuggestionPublication} from './publication-preview.js';

async function mutate(fn){
 if(state.collaborationBusy)return null;
 const controls=[...document.getElementById('revisionMarkup')?.querySelectorAll('button,select,textarea')||[]].map(n=>[n,n.disabled]);
 state.collaborationBusy=true;controls.forEach(([n])=>n.disabled=true);renderEditBar();
 try{return await fn();}finally{state.collaborationBusy=false;controls.forEach(([n,disabled])=>{if(n.isConnected)n.disabled=disabled;});renderEditBar();}
}
async function act(fn){try{await fn();}catch(e){showNotice(e.message,[], 'warn');}}
export async function submitActiveDraft(){
 const r=state.activeRevision;if(!r||!capability('propose'))return;
 if(state.composing){showNotice('請先完成輸入，再送出修訂建議。');return;}
 const proposedHtml=prepareSuggestionContent(cleanSnapshot(el.doc.innerHTML));
 const body={baseVersion:r.baseVersion,baseHash:r.baseHash,proposedHtml,...(r.sourceSuggestionId?{sourceSuggestionId:r.sourceSuggestionId,sourceItemIds:r.sourceItemIds}:{})};
 const fingerprint=JSON.stringify(body);if(r.suggestionRequest?.fingerprint!==fingerprint)r.suggestionRequest={fingerprint,requestId:crypto.randomUUID()};
 saveDraftNow();el.finishRevisionBtn.disabled=true;
 try{
  const result=await collaborationApi('/suggestions/create',{...body,requestId:r.suggestionRequest.requestId});
  // Never clear changes typed while the submission was in flight.
  if(state.activeRevision===r&&prepareSuggestionContent(cleanSnapshot(el.doc.innerHTML))===proposedHtml){clearSavedDraft();state.activeRevision=null;await loadSuggestion(result.id);}
  else showNotice(`${result.id} 已送出；後續草稿修改仍保留。`);
 }catch(e){saveDraftNow();showNotice(e.message+'；草稿已保留，可再次送出。',[], 'warn');}
 finally{renderEditBar();}
}
export async function openSuggestionList(){
 await act(async()=>{
  let cursor=0;const body=h('div'),more=h('button',{onclick:()=>act(load)},'載入更多');
  const modal=openModal({title:'修訂建議',body:[body,more],actions:[{label:'關閉'}]});
  async function load(){const r=await collaborationApi('/suggestions/list',{cursor});cursor=r.cursor;
   body.append(...r.suggestions.map(s=>h('section',{},h('p',{},`${s.id} · ${s.baseVersion} · ${s.status==='withdrawn'?'已撤回':s.status==='completed'?'已結清':'待處理'}`),h('button',{onclick:()=>act(async()=>{saveDraftNow();state.suggestionCards=null;await loadSuggestion(s.id);modal.close();})},'開啟 '+s.id))));more.hidden=r.suggestions.length<50;
   if(!body.children.length)body.textContent='目前沒有修訂建議。';
  }await load();
 });
}
export async function loadSuggestion(id){
 const s=await collaborationApi('/suggestions/get',{id});s.history=[];let cursor=0;while(true){const r=await collaborationApi('/suggestions/history',{id,cursor});s.history.push(...r.events);cursor=r.cursor;if(r.events.length<50)break;}state.suggestion=s;state.privateView='suggestion';state.activeRevision=null;
 state.suppressObserver=true;setDocHtml(sanitizeRevisionHtml(buildFormalDiff(s.baseHtml,s.proposedHtml)));state.suppressObserver=false;
 el.doc.contentEditable='false';el.doc.classList.remove('editing');el.versionCard.hidden=true;el.revisionPanel.classList.remove('show');el.versionLabel.textContent=s.id+' · 修訂建議';
 document.getElementById('documentReview').classList.remove('simple-markup');el.doc.classList.remove('clean');
 const panel=renderSuggestionView(s,{
  close:()=>openModal({title:'返回正式版？',body:[
   h('p',{},'返回後只會切換到正式版，不會刪除修訂建議、採納決定或已儲存備註；可從「修訂建議」再次開啟。'),
   [...(state.suggestionNotes||[])].some(([key,n])=>key.startsWith(s.id+':')&&n.text.trim())?h('p',{},'未儲存備註仍暫存在此頁，重新整理或關閉頁面後不保留。'):null,
  ],actions:[{label:'繼續檢視'},{label:'確認返回',primary:true,run:async()=>{state.suggestionCards=null;await renderVersion(latestVersion());}}]}),
  decide:(itemIds,decision)=>act(()=>mutate(async()=>{
   const panel=document.getElementById('revisionMarkup'),id=itemIds.includes(state.selectedSuggestionItem)?state.selectedSuggestionItem:null;
   const card=[...panel.querySelectorAll('[data-suggestion-item]')].find(n=>n.dataset.suggestionItem===id),offset=card?card.getBoundingClientRect().top-panel.getBoundingClientRect().top:null,scrollTop=panel.scrollTop;
   await collaborationApi('/suggestions/decide',{id:s.id,itemIds,decision,expectedRevision:s.revision,requestId:crypto.randomUUID()});
   if(state.suggestionCards?.id===s.id)itemIds.forEach(id=>state.suggestionCards.choices.delete(id));
   await loadSuggestion(s.id);
   const updated=[...panel.querySelectorAll('[data-suggestion-item]')].find(n=>n.dataset.suggestionItem===id);
   if(updated&&offset!==null){panel.scrollTop+=updated.getBoundingClientRect().top-panel.getBoundingClientRect().top-offset;updated.querySelector('.suggestion-card-toggle')?.focus({preventScroll:true});}
   else panel.scrollTop=scrollTop;
  })),
  history:async box=>act(async()=>{let cursor=0,all=[];do{const r=await collaborationApi('/suggestions/history',{id:s.id,cursor});all.push(...r.events);cursor=r.cursor;if(r.events.length<50)break;}while(true);renderSuggestionHistory(box,all);}),
  comment:async(itemIds,text)=>{try{return await mutate(()=>collaborationApi('/suggestions/comment',{id:s.id,itemIds,text,requestId:crypto.randomUUID()}));}catch(e){showNotice(e.message+'；備註內容已保留，可重試。',[], 'warn');return null;}},
  withdraw:()=>act(async()=>{if(!confirm('撤回建議後，原內容與歷程仍保留。確定撤回？'))return;await collaborationApi('/suggestions/withdraw',{id:s.id,expectedRevision:s.revision,requestId:crypto.randomUUID()});await loadSuggestion(s.id);}),
  compare:()=>act(()=>compareSuggestion(s)),
 });panel.id='revisionMarkup';panel.setAttribute('data-private','true');panel.hidden=false;applyCleanState();
 // An explicit hook identifies the private view without mixing it into formal versions.
 panel.dataset.suggestionPanel='true';let marker=document.getElementById('suggestionPanel');if(!marker){marker=h('span',{id:'suggestionPanel'});panel.prepend(marker);}marker.textContent=s.id;
 renderEditBar();updatePdfLink();
}
async function compareSuggestion(s){
 const result=await collaborationApi('/suggestions/compare',{id:s.id});
 const text=h('p',{},'請對照原建議與最新正式內容，手動修訂新草稿；先前採納結果不會自動帶入。');
 const original=h('details',{open:true},h('summary',{},'原建議'),h('div',{class:'comparison-original'}));original.lastElementChild.innerHTML=sanitizeRevisionHtml(s.proposedHtml);
 const modal=openModal({title:'重新比較',body:[text,original,...(savedDraft()?[h('p',{},'本機另有未完成草稿；建立新草稿會取代它，請先下載備份。'),h('button',{onclick:()=>downloadBackup(savedDraft())},'下載既有草稿備份')]:[])],actions:[{label:'取消'},{label:'以最新正式版建立草稿',primary:true,run:async()=>{
  if(state.activeRevision){saveDraftNow();return false;}
  // Compare only exposes a trusted current draft; do not guess a merge.
  const current=await collaborationApi('/collaboration/current');if(current.latestVersion!==result.baseVersion)throw new Error('正式版再次更新，請重新比較。');
  const baseVersion=result.baseVersion;Object.assign(state.versions,current.versions);state.docState.latestVersion=baseVersion;
  const created=await startRevision({html:result.draftHtml,sourceSuggestionId:s.id,sourceItemIds:result.unresolvedItems.map(i=>i.id)});if(!created)throw new Error('提出修訂權限或連線已變更；未建立新草稿，原草稿仍保留。');saveDraftNow();showNotice('已開啟最新草稿；原建議完整保留，可在修訂建議清單中對照。');
 }}]});return modal;
}

export async function previewCurrentSuggestion(){
 if(state.privateView!=='suggestion'||!state.suggestion||!capability('publish')||state.collaborationBusy)return;
 await act(()=>mutate(()=>openPublicationPreview(state.suggestion)));
}
