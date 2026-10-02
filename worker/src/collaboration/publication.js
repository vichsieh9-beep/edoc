import {fail,expectRevision} from './contracts.js';
import {requireCapability,policyFor} from './permissions.js';
import {getSuggestion,selectItems,buildSuggestionPreview,saveSuggestion,recomputeStatus} from './suggestions.js';
import {trustedContent,hashContent} from '../content.js';
import {nextVersion} from '../../../src/engine/version.js';
import {validateVersion} from '../legacy-versions.js';

export const getPublication=(store,doc,id)=>{const p=store.get('publications',id,doc);if(!p)fail(404,'not_found','找不到發布記錄');return p;};
export const publicPublication=p=>({id:p.id,doc:p.doc,suggestionId:p.suggestionId,baseVersion:p.baseVersion,versionKey:p.versionKey,status:p.status,attempts:p.attempts,nextAttemptAt:p.nextAttemptAt,commit:p.commit||null});
export async function preparePublication(store,actor,b,gh){requireCapability(store,actor,b.doc,'publish');const preview=await buildSuggestionPreview(store,actor,b,gh);if(preview.previewHash!==b.previewHash)fail(409,'preview','預覽已變動，請重新確認');return preview;}
export function acceptPublication(store,actor,b,preview,event,now){
 requireCapability(store,actor,b.doc,'publish');if(!policyFor(store,b.doc).enabled)fail(409,'mode_disabled','修訂建議模式已關閉');
 const s=getSuggestion(store,b.doc,b.id);expectRevision(s.revision,b.expectedRevision);const selected=selectItems(s,b.itemIds);
 if(selected.some(i=>i.decision!=='adopt'||i.publishedIn||i.lockedBy))fail(409,'items','採納結果已變動');
 if(store.list('document_writes',b.doc).length)fail(409,'publishing','這份文件已有發布工作');
 const id=crypto.randomUUID(),p={id,doc:b.doc,suggestionId:s.id,itemIds:b.itemIds,baseVersion:s.baseVersion,baseHash:s.baseHash,suggestionRevision:s.revision,contentHash:preview.contentHash,formalHtml:preview.html,cleanHtml:preview.cleanHtml,stats:preview.stats,versionKey:nextVersion(s.baseVersion),status:'accepted',attempts:0,checks:0,nextAttemptAt:now.getTime(),actorSnapshot:{id:actor.id,name:actor.name,company:actor.company},acceptedAt:now.toISOString()};
 for(const i of selected){i.lockedBy=id;store.put('items',b.doc+':'+i.id,b.doc,i);}s.revision++;saveSuggestion(store,s);
 store.put('document_writes',id,b.doc,{id,doc:b.doc,kind:'suggestion'});store.put('publications',id,b.doc,p);store.appendEvent(event('publication.accepted',{suggestionId:s.id,itemIds:b.itemIds,publicationId:id,afterState:{status:p.status,versionKey:p.versionKey}}));return p;
}
function eventFor(p,action,now,extra={}){return {id:crypto.randomUUID(),doc:p.doc,suggestionId:p.suggestionId,itemIds:p.itemIds,publicationId:p.id,actorSnapshot:p.actorSnapshot,time:now.toISOString(),action,...extra};}
function finishSaved(store,p,versionKey,commit,now){
 return store.transact(()=>{
  const existing=getPublication(store,p.doc,p.id);if(existing.status==='saved')return existing;
  const s=getSuggestion(store,p.doc,p.suggestionId);
  for(const id of p.itemIds){const i=s.items.find(i=>i.id===id);i.publishedIn=versionKey;delete i.lockedBy;store.put('items',p.doc+':'+id,p.doc,i);}
  s.revision++;recomputeStatus(s);saveSuggestion(store,s);
  const next={...existing,status:'saved',versionKey,commit:commit||existing.commit||null,nextAttemptAt:null,leaseUntil:null};store.put('publications',p.id,p.doc,next);store.removeWrite(p.doc);store.appendEvent(eventFor(p,'publication.saved',now,{afterState:{versionKey,commit:next.commit}}));return next;
 });
}
function finishConflict(store,p,now){return store.transact(()=>{
 const s=getSuggestion(store,p.doc,p.suggestionId);for(const id of p.itemIds){const i=s.items.find(i=>i.id===id);delete i.lockedBy;store.put('items',p.doc+':'+id,p.doc,i);}s.revision++;saveSuggestion(store,s);
 const next={...p,status:'conflict',nextAttemptAt:null,leaseUntil:null};store.put('publications',p.id,p.doc,next);store.removeWrite(p.doc);store.appendEvent(eventFor(p,'publication.conflict',now));return next;
});}
function saveFailure(store,p,now){return store.transact(()=>{
 const current=getPublication(store,p.doc,p.id),failed=current.attempts>=3||current.checks>=3;
 const next={...current,status:failed?'failed':'reconciling',leaseUntil:null,nextAttemptAt:failed?null:now.getTime()+[30_000,120_000,600_000][Math.min(Math.max(current.attempts,current.checks)-1,2)]};
 store.put('publications',p.id,p.doc,next);store.appendEvent(eventFor(p,failed?'publication.failed':'publication.retry_pending',now,{afterState:{attempts:next.attempts,status:next.status}}));return next;
});}
export async function advancePublication(store,gh,id,doc,now){
 let p=getPublication(store,doc,id);if(['saved','conflict','failed'].includes(p.status))return p;
 if(p.nextAttemptAt>now.getTime()||p.status==='writing'&&p.leaseUntil>now.getTime())return p;
 p=store.transact(()=>{const p=getPublication(store,doc,id);if(p.status==='writing'&&p.leaseUntil>now.getTime())return null;const next={...p,status:'writing',leaseUntil:now.getTime()+120_000};store.put('publications',id,doc,next);return next;});if(!p)return getPublication(store,doc,id);
 try{
  const {json:document,sha}=await gh.readJson(`documents/${doc}/document.json`);
  const saved=Object.entries(document.versions||{}).find(([,v])=>v.publicationId===id);
  if(saved){if(saved[1].contentHash!==p.contentHash||await hashContent(trustedContent(saved[1].html))!==p.contentHash)fail(409,'integrity','已寫入版本與發布內容不符');return finishSaved(store,p,saved[0],p.commit,now);}
  if(document.latestVersion!==p.baseVersion||await hashContent(trustedContent(document.versions[document.latestVersion].html))!==p.baseHash||document.archived)return finishConflict(store,p,now);
  const recent=Object.values(document.versions).filter(v=>{const line=(v.details||[]).find(x=>x.startsWith('建立時間：'));const t=line?Date.parse(line.slice(5)):NaN;return !Number.isNaN(t)&&now.getTime()-t<3600_000;}).length;
  if(recent>=10)fail(429,'rate_limited','這份文件一小時內更新太多次');
  if(p.attempts>=3)return saveFailure(store,p,now);
  p={...p,attempts:p.attempts+1};store.put('publications',id,doc,p);
  const stats=p.stats;
  const version=validateVersion({summary:`統計：${stats.modifiedBlocks} 處修改、${stats.addedBlocks} 處新增、${stats.deletedBlocks} 處刪除`,details:[...stats.details.filter(x=>!x.startsWith('語意摘要：')).slice(0,38),'建立時間：'+p.acceptedAt],previous:p.baseVersion,html:p.formalHtml,publicationId:id,contentHash:p.contentHash},{previous:p.baseVersion,editor:p.actorSnapshot.name,now:new Date(p.acceptedAt),publication:true});
  const next={...document,latestVersion:p.versionKey,versions:{...document.versions,[p.versionKey]:version}};
  const commit=await gh.writeJson(`documents/${doc}/document.json`,next,sha,`Publish ${p.versionKey} via EDoc (${id})`,'正式文件已更新，請重新比較');
  return finishSaved(store,p,p.versionKey,commit,now);
 }catch(e){
  // Any write result may be unknown: never append again before reading its publicationId.
  const latest=getPublication(store,doc,id);if(latest.status==='saved')return latest;
  if(p.attempts>0){
   try{const {json:current}=await gh.readJson(`documents/${doc}/document.json`);const match=Object.entries(current.versions||{}).find(([,v])=>v.publicationId===id);
    if(match&&match[1].contentHash===p.contentHash&&await hashContent(trustedContent(match[1].html))===p.contentHash)return finishSaved(store,p,match[0],p.commit,now);
    if(!match&&current.latestVersion!==p.baseVersion)return finishConflict(store,p,now);
   }catch{} // Preserve unknown outcome for the next durable reconciliation attempt.
  }
  if(e.code==='integrity'){const failed={...latest,status:'failed',nextAttemptAt:null,leaseUntil:null};store.put('publications',id,doc,failed);return failed;}
  store.put('publications',id,doc,{...latest,checks:latest.checks+1});
  return saveFailure(store,p,now);
 }
}
export function retryPublication(store,actor,b,event,now){
 requireCapability(store,actor,b.doc,'publish');if(!policyFor(store,b.doc).enabled)fail(409,'mode_disabled','模式已關閉');const p=getPublication(store,b.doc,b.publicationId);
 if(p.status!=='failed')fail(409,'state','只有失敗的工作可以重新嘗試');
 const next={...p,status:'reconciling',attempts:0,checks:0,nextAttemptAt:now.getTime()};store.put('publications',p.id,p.doc,next);store.appendEvent(event('publication.retried',{publicationId:p.id,suggestionId:p.suggestionId}));return next;
}
