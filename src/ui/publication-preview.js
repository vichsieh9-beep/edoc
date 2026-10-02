import {h,openModal} from '../library/modal.js';
import {state} from './state.js';
import {el} from './elements.js';
import {collaborationApi,capability} from './access.js';
import {sanitizeRevisionHtml} from '../engine/revision.js';
import {nextVersion} from '../engine/version.js';
import {renderVersion} from './version-view.js';
import {renderEditBar} from './edit-bar.js';
import {markPublishing} from './publish-status.js';
import {readStore,writeStore,removeStore} from './storage.js';
import {showNotice} from './notice.js';

const key=()=>`edoc-publication:${state.docState.documentId}`;
let timer=null,tracking=null;
export async function openPublicationPreview(s){
 const itemIds=s.items.filter(i=>i.decision==='adopt'&&!i.publishedIn&&!i.lockedBy).map(i=>i.id);
 if(!itemIds.length)throw new Error('沒有尚未發布的採納內容，不建立空版本。');
 const preview=await collaborationApi('/suggestions/preview',{id:s.id,itemIds,expectedRevision:s.revision});
 state.privateView='preview';renderEditBar();
 const content=h('div',{class:'preview-document'});content.innerHTML=sanitizeRevisionHtml(preview.html);
 const message=h('p',{role:'status'});
 const box=h('section',{id:'publicationPreview',class:'publication-preview','aria-label':'採納內容預覽'},
  h('p',{},`${s.baseVersion} → ${nextVersion(s.baseVersion)} · 採納 ${preview.decisionCounts.adopt} · 不採納 ${preview.decisionCounts.decline} · 待討論 ${preview.decisionCounts.pending}`),
  h('p',{},`本次只發布 ${itemIds.length} 項採納內容；不採納與待討論項目均保留，所有修訂與備註留在完整歷程。`),
  h('p',{},'正文統計：'+preview.stats.summary),h('p',{},'目前是私人預覽，尚未產生正式版本或官方 PDF。'),content,message);
 const requestId=crypto.randomUUID();
 const modal=openModal({title:'發布新版',body:[box],onClose:()=>{
  if(state.privateView==='preview'){state.privateView='suggestion';renderEditBar();el.publishSuggestionBtn.focus({preventScroll:true});}
 },actions:[{label:'返回修訂建議'},{label:'確認並發布',primary:true,run:publish}]});
 modal.root.parentElement.classList.add('publication-dialog');
 async function publish(){
  message.textContent='確認中…';
  try{const p=await collaborationApi('/suggestions/publish',{id:s.id,itemIds,expectedRevision:s.revision,previewHash:preview.previewHash,requestId});
   writeStore(key(),JSON.stringify({publicationId:p.id,doc:state.meta.slug}));await trackSuggestionPublication(p.id);return true;
  }catch(e){message.textContent=e.message+(e.status===409?'，請返回建議重新檢視與預覽。':'，可重試同一發布。');
   if(e.status===409||!capability('publish'))modal.setActions([{label:'返回修訂建議'}]);
   return false;
  }
 }
 return preview;
}
export async function trackSuggestionPublication(publicationId){
 clearTimeout(timer);tracking=publicationId;
 async function poll(){
  if(tracking!==publicationId)return;
  try{
   const p=await collaborationApi('/suggestions/publication',{publicationId});
   if(p.status==='saved'){
    if(!p.formalVersion)throw new Error('正式版本已儲存，暫時無法讀取內容；稍後重試。');
    const current=await collaborationApi('/collaboration/current');
    Object.assign(state.versions,current.versions);state.versions[p.versionKey]=p.formalVersion;
    if(Number(current.latestVersion.slice(1))>=Number(state.docState.latestVersion.slice(1)))state.docState.latestVersion=current.latestVersion;
    const displayed=state.docState.latestVersion;markPublishing(p.versionKey,{verifyPdf:true,onComplete:()=>{let record;try{record=JSON.parse(readStore(key())||'null');}catch{}if(record?.publicationId===publicationId)removeStore(key());}});
    document.getElementById('publicationPreview')?.remove();if(!state.activeRevision)await renderVersion(displayed);
    showNotice(`${p.versionKey} 已存入正式文件；目前最新正式版為 ${state.docState.latestVersion}。公開頁面與 PDF 更新中。`,[{label:'查看修訂歷程',onClick:async()=>{const {loadSuggestion}=await import('./suggestions.js');await loadSuggestion(p.suggestionId);}}]);tracking=null;return;
   }
   if(p.status==='conflict'){showNotice('正式基準已更新，發布未完成；原建議與決定仍保留，請重新比較。',[], 'warn');tracking=null;removeStore(key());return;}
   if(p.status==='failed'){
    showNotice('發布暫時失敗，工作與建議仍保留。',[...(capability('publish')?[{label:'重試同一發布',onClick:async()=>{await collaborationApi('/suggestions/publication/retry',{publicationId,requestId:crypto.randomUUID()});await trackSuggestionPublication(publicationId);}}]:[])],'warn');tracking=null;return;
   }
   showNotice('發布已受理，正在核對正式文件；尚未新增本頁正式版號。');
  }catch(e){showNotice(e.message+'；發布工作已保留。',[{label:'重新查詢發布',onClick:()=>trackSuggestionPublication(publicationId)}],'warn');if(e.status===401||e.status===403){tracking=null;return;}}
  timer=setTimeout(poll,window.__EDOC_POLL_MS||5000);
 }
 await poll();
}
export async function resumeSuggestionPublication(){
 let pending;try{pending=JSON.parse(readStore(key())||'null');}catch{}
 if(pending?.doc===state.meta.slug&&pending.publicationId&&capability('view'))await trackSuggestionPublication(pending.publicationId);
}
addEventListener('pagehide',()=>{clearTimeout(timer);tracking=null;});
