import {fail,checkRequestId} from './contracts.js';
import {policyFor,requireCapability} from './permissions.js';
import {publishLegacy,validateVersion} from '../legacy-versions.js';
// Existing direct publishers participate in the same durable document write gate.
export async function acceptLegacyWrite(store,actor,b,gh,now){
 if(!actor.legacy)fail(403,'forbidden','此連結不能直接發布');
 if(policyFor(store,b.doc).enabled)fail(403,'suggestion_required','請先送出修訂建議，再採納並發布');
 const pending=store.list('document_writes',b.doc)[0];
 if(pending&&pending.kind==='legacy'&&pending.actorSnapshot.id===actor.id){
  const expected=validateVersion(b.version,{previous:b.baseVersion,editor:pending.actorSnapshot.name,now:new Date(pending.acceptedAt)});
  if(pending.body.versionKey===b.versionKey&&JSON.stringify(pending.expected)===JSON.stringify(expected))return pending;
 }
 const {json:current}=await gh.readJson(`documents/${b.doc}/document.json`);
 if(current.latestVersion!==b.baseVersion)fail(409,'conflict',`文件已經更新到 ${current.latestVersion}，請重新整理後再修改；你的修改已暫存在這個瀏覽器。`);
 const expected=validateVersion(b.version,{previous:b.baseVersion,editor:actor.name,now});
 return store.transact(()=>{
  if(policyFor(store,b.doc).enabled)fail(403,'suggestion_required','請先送出修訂建議，再採納並發布');
  const old=store.list('document_writes',b.doc)[0];
  if(old){if(old.kind!=='legacy'||old.actorSnapshot.id!==actor.id||old.body.versionKey!==b.versionKey||JSON.stringify(old.expected)!==JSON.stringify(expected))fail(409,'publishing','文件正在發布');return old;}
  const record={id:crypto.randomUUID(),doc:b.doc,kind:'legacy',status:'accepted',body:{...b,token:undefined,requestId:undefined},expected,actorSnapshot:{id:actor.id,name:actor.name,company:actor.company},legacyLink:actor.legacyLink,acceptedAt:now.toISOString(),attempts:0,nextAttemptAt:now.getTime()};store.put('document_writes',record.id,b.doc,record);return record;
 });
}
function finish(store,p,result,now){store.transact(()=>{
 if(!store.get('document_writes',p.id,p.doc))return;
 store.removeWrite(p.doc);if(p.recoveryRequestKey)store.put('requests',p.recoveryRequestKey,p.doc,{payloadHash:p.recoveryPayloadHash,result:{completed:true,result}});store.appendEvent({id:crypto.randomUUID(),doc:p.doc,actorSnapshot:p.actorSnapshot,time:now.toISOString(),action:'legacy.published',afterState:result});
});return result;}
export async function advanceLegacyWrite(store,gh,p,now){
 if(p.leaseUntil>now.getTime())fail(409,'publishing','文件正在發布');
 p=store.transact(()=>{const old=store.get('document_writes',p.id,p.doc);if(!old)return null;if(old.leaseUntil>now.getTime())fail(409,'publishing','文件正在發布');const next={...old,attempts:old.attempts+1,leaseUntil:now.getTime()+120_000};store.put('document_writes',old.id,old.doc,next);return next;});
 if(!p)return null;
 try{
  const {json:doc}=await gh.readJson(`documents/${p.doc}/document.json`);
  if(JSON.stringify(doc.versions[p.body.versionKey])===JSON.stringify(p.expected))return finish(store,p,{version:p.body.versionKey,commit:null},now);
  if(doc.latestVersion!==p.body.baseVersion){store.transact(()=>{store.removeWrite(p.doc);store.appendEvent({id:crypto.randomUUID(),doc:p.doc,actorSnapshot:p.actorSnapshot,time:now.toISOString(),action:'legacy.conflict'});});fail(409,'conflict',`文件已經更新到 ${doc.latestVersion}，請重新整理後再修改；你的修改已暫存在這個瀏覽器。`);}
  const result=await publishLegacy({body:p.body,link:p.legacyLink,gh,now:new Date(p.acceptedAt)});return finish(store,p,result,now);
 }catch(e){
  const existing=store.get('document_writes',p.id,p.doc);if(!existing)throw e;
  try{const {json:doc}=await gh.readJson(`documents/${p.doc}/document.json`);if(JSON.stringify(doc.versions[p.body.versionKey])===JSON.stringify(p.expected))return finish(store,p,{version:p.body.versionKey,commit:null},now);}catch{}
  if(e.status&&e.status<500){store.transact(()=>{store.removeWrite(p.doc);store.appendEvent({id:crypto.randomUUID(),doc:p.doc,actorSnapshot:p.actorSnapshot,time:now.toISOString(),action:'legacy.failed',afterState:{code:e.code}});});throw e;}
  store.put('document_writes',p.id,p.doc,{...existing,leaseUntil:null,status:existing.attempts>=3?'failed':'reconciling',nextAttemptAt:existing.attempts>=3?null:now.getTime()+30_000});throw e;
 }
}

export function legacyWriteStatus(store,actor,doc){
 if(!actor.legacy||!actor.admin)fail(403,'forbidden','恢復舊發布需要有效管理員連結');
 if(policyFor(store,doc).policyRevision)requireCapability(store,actor,doc,'manage');
 const p=store.list('document_writes',doc).find(p=>p.kind==='legacy');
 return p?{id:p.id,status:p.status,version:p.body.versionKey,actorSnapshot:p.actorSnapshot,attempts:p.attempts}:{status:'idle'};
}
export function retryLegacyWrite(store,actor,b,event,now,payloadHash){
 legacyWriteStatus(store,actor,b.doc);checkRequestId(b.requestId);
 return store.transact(()=>{
  const requestKey=`${b.doc}:${actor.id}:${b.requestId}`;const cached=store.getRequestResult(requestKey,payloadHash);
  if(cached?.completed)return cached;
  const old=store.get('document_writes',b.writeId,b.doc);
  if(cached&&old)return old;
  if(!old||old.kind!=='legacy')fail(404,'not_found','找不到待恢復的舊發布');
  if(old.leaseUntil>now.getTime())fail(409,'publishing','文件正在發布');
  // Preserve the accepted content and original author. Recovery never substitutes a new edit.
  const next={...old,status:'reconciling',attempts:0,leaseUntil:null,nextAttemptAt:now.getTime(),recoveryRequestKey:requestKey,recoveryPayloadHash:payloadHash};
  store.put('document_writes',next.id,next.doc,next);store.put('requests',requestKey,b.doc,{payloadHash,result:{accepted:true}});
  store.appendEvent(event('legacy.retry_requested',{publicationId:next.id,afterState:{originalActor:next.actorSnapshot}}));
  return next;
 });
}
