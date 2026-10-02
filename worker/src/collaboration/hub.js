import {acceptLegacyWrite,advanceLegacyWrite,legacyWriteStatus,retryLegacyWrite} from './legacy-publication.js';
import {preparePublication,acceptPublication,advancePublication,getPublication,publicPublication,retryPublication} from './publication.js';
import {prepareSuggestion,createSuggestion,decideItems,withdrawSuggestion,commentOnSuggestion,buildSuggestionPreview,getSuggestion,readCurrent} from './suggestions.js';
import { CollaborationStore } from './store.js';
import { policyFor,resolveActor,capabilitiesFor,requireCapability,setPolicy,createLink,saveLink,updateGrant,publicLink } from './permissions.js';
import { fail,checkRequestId } from './contracts.js';
import { hashContent,trustedContent } from '../content.js';
import { github } from '../github.js';
import {createEditLink,listEditLinks,revokeEditLink} from '../legacy-links.js';
import { publishLegacy } from '../legacy-versions.js';

export class CollaborationHub {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.store=new CollaborationStore(ctx.storage);this.gh=github(env,fetch);this.clock=()=>new Date();this.random=n=>crypto.getRandomValues(new Uint8Array(n));}
 eventFactory(actor,doc){return (action,extra={})=>({id:crypto.randomUUID(),doc,time:this.clock().toISOString(),actorSnapshot:{id:actor.id,name:actor.name,company:actor.company},action,...extra});}
 async fetch(request){
  try{let {path,body:b}=await request.json();
   if(path==='/links/revoke'&&!b.doc){
    const {json:registry}=await this.gh.readJson('edit-links.json');const hash=await hashContent(b.token||'');const admin=registry.links.find(l=>l.tokenHash===hash&&!l.revoked);
    if(!admin)fail(401,'unauthorized','編輯連結無效或已停用');if(admin.role!=='admin')fail(403,'forbidden','只有管理員可以管理連結');
    const target=registry.links.find(l=>l.id===b.id);if(!target)fail(404,'not_found','找不到這條編輯連結');if(target.role==='admin')fail(403,'forbidden','管理員連結只能在終端機停用');
    b.doc=target.documents.find(d=>d!=='*')||'qa-senior-game-qa';
   }
   if(!/^[a-z0-9][a-z0-9-]{0,63}$/.test(b.doc||''))fail(400,'doc','文件代號錯誤');
   const actor=await resolveActor(this.store,b.token,b.doc,this.gh),event=this.eventFactory(actor,b.doc);
   if(path==='/collaboration/current'){requireCapability(this.store,actor,b.doc,'view');const {doc}=await readCurrent(this.gh,b.doc,{active:true});return Response.json(doc);}
   if(path==='/session'){const p=policyFor(this.store,b.doc);return Response.json({name:actor.name,role:actor.admin?'admin':'editor',...(p.policyRevision?{actorId:actor.id,capabilities:capabilitiesFor(this.store,actor,b.doc),policy:p}:{})});}
   if(['/links','/links/list','/links/revoke'].includes(path)&&!policyFor(this.store,b.doc).enabled){
    if(!actor.legacy)fail(403,'forbidden','這條連結不能管理舊分享');
    const fn={'/links':createEditLink,'/links/list':listEditLinks,'/links/revoke':revokeEditLink}[path];
    return Response.json(await fn({body:b,link:actor.legacyLink,auth:{link:actor.legacyLink,registry:actor.registry,sha:actor.registrySha},gh:this.gh,now:this.clock(),random:this.random}),{status:path==='/links'?201:200});
   }
   if(path==='/collaboration/legacy/status')return Response.json(legacyWriteStatus(this.store,actor,b.doc));
   if(path==='/collaboration/legacy/retry'){
    const payloadHash=await hashContent(JSON.stringify({path,writeId:b.writeId}));
    const p=retryLegacyWrite(this.store,actor,b,event,this.clock(),payloadHash);if(p.completed)return Response.json(p.result,{status:201});
    try{return Response.json(await advanceLegacyWrite(this.store,this.gh,p,this.clock()),{status:201});}finally{await this.schedule();}
   }
   if(path==='/versions')return await this.legacyPublication(actor,b,event);
   if(path==='/collaboration/settings'&&b.enabled===undefined){requireCapability(this.store,actor,b.doc,'view');return Response.json(policyFor(this.store,b.doc));}
   if(path==='/collaboration/links/list'||path==='/links/list'){
    requireCapability(this.store,actor,b.doc,'manage');return Response.json({links:this.store.list('links',b.doc).map(publicLink)});
   }
   if(path==='/suggestions/history'){requireCapability(this.store,actor,b.doc,'view');return Response.json(this.store.readEvents(b.doc,b.cursor||0,50,b.id));}
   if(path==='/suggestions/get'){requireCapability(this.store,actor,b.doc,'view');return Response.json(getSuggestion(this.store,b.doc,b.id));}
   if(path==='/suggestions/list'){requireCapability(this.store,actor,b.doc,'view');const all=this.store.list('suggestions',b.doc);const offset=b.cursor||0;if(!Number.isInteger(offset)||offset<0)fail(400,'cursor','游標不符');return Response.json({suggestions:all.slice(offset,offset+50),cursor:Math.min(all.length,offset+50)});}
   if(path==='/suggestions/compare'){
    requireCapability(this.store,actor,b.doc,'propose');if(!policyFor(this.store,b.doc).enabled)fail(409,'mode_disabled','模式已關閉');
    const s=getSuggestion(this.store,b.doc,b.id),{doc}=await readCurrent(this.gh,b.doc,{active:true});const draftHtml=trustedContent(doc.versions[doc.latestVersion].html);
    return Response.json({baseVersion:doc.latestVersion,baseHash:await hashContent(draftHtml),draftHtml,sourceSuggestionId:s.id,originalBaseHtml:s.baseHtml,originalProposedHtml:s.proposedHtml,unresolvedItems:s.items.filter(i=>!i.publishedIn),requiresManualMerge:true});
   }
   if(path==='/suggestions/preview')return Response.json(await buildSuggestionPreview(this.store,actor,b,this.gh));
   if(path==='/suggestions/publication'){
    requireCapability(this.store,actor,b.doc,'view');const p=getPublication(this.store,b.doc,b.publicationId);const next=await advancePublication(this.store,this.gh,p.id,p.doc,this.clock());await this.schedule();let formalVersion;if(next.status==='saved'){const {doc}=await readCurrent(this.gh,b.doc);formalVersion=doc.versions[next.versionKey];if(formalVersion?.publicationId!==next.id)fail(409,'integrity','正式版本發布識別碼不符');}return Response.json({...publicPublication(next),...(formalVersion?{formalVersion}:{})});
   }
   const payload={...b};delete payload.token;delete payload.requestId;
   const payloadHash=await hashContent(JSON.stringify({path,payload}));checkRequestId(b.requestId);const key=`${b.doc}:${actor.id}:${b.requestId}`;
   const required=path.startsWith('/collaboration/')||path.startsWith('/links')?'manage':path==='/suggestions/create'||path==='/suggestions/withdraw'?'propose':path==='/suggestions/decide'?'decide':path==='/suggestions/comment'?'view':path==='/suggestions/publish'||path==='/suggestions/publication/retry'?'publish':null;
   if(required&&!b.recoverOwner&&(policyFor(this.store,b.doc).policyRevision||path.startsWith('/suggestions/')))requireCapability(this.store,actor,b.doc,required);
   const cached=this.store.getRequestResult(key,payloadHash);if(cached)return Response.json(cached,{status:path==='/suggestions/publish'||path==='/suggestions/publication/retry'?202:path.endsWith('/create')||path==='/links'?201:200});
   if(path==='/collaboration/settings'||path==='/collaboration/links/create'){const {json:doc}=await this.gh.readJson(`documents/${b.doc}/document.json`);if(doc.archived)fail(409,'archived','這份文件已封存');}
   if(path.startsWith('/suggestions/')&&path!=='/suggestions/comment')await readCurrent(this.gh,b.doc,{active:true});
   if(path==='/suggestions/decide'){
    const s=getSuggestion(this.store,b.doc,b.id),{doc}=await readCurrent(this.gh,b.doc,{active:true});if(doc.latestVersion!==s.baseVersion)fail(409,'base','基準已更新，請重新比較');
   }
   let publicationPrepared;if(path==='/suggestions/publish')publicationPrepared=await preparePublication(this.store,actor,b,this.gh);
   let suggestionPrepared;if(path==='/suggestions/create')suggestionPrepared=await prepareSuggestion(this.store,actor,b,this.gh);
   if(path==='/collaboration/links/rotate'){const old=this.store.get('links',b.doc+':'+b.id,b.doc)||this.store.get('links',b.id,b.doc);if(!old)fail(404,'not_found','找不到連結');b={...b,name:old.name,company:old.company,capabilities:old.capabilities};}
   let prepared;if(path==='/collaboration/links/create'||path==='/collaboration/links/rotate'||path==='/links')prepared=await createLink(this.store,actor,b,event);
   const result=this.store.transact(()=>{
    const again=this.store.getRequestResult(key,payloadHash);if(again)return again;
    let r;
    if(path==='/collaboration/links/rotate'){const old=this.store.get('links',b.doc+':'+b.id,b.doc)||this.store.get('links',b.id,b.doc);if(!old)fail(404,'not_found','找不到連結');updateGrant(this.store,actor,{...b,enabled:false},event);r=saveLink(this.store,actor,b,prepared.link,event);}
    else if(path==='/collaboration/settings')r=setPolicy(this.store,actor,b,event);
    else if(prepared)r=saveLink(this.store,actor,b,prepared.link,event);
    else if(path==='/collaboration/links/update'||path==='/links/revoke'){
     if(path==='/links/revoke'){const old=this.store.get('links',b.doc+':'+b.id,b.doc)||this.store.get('links',b.id,b.doc);b={...b,enabled:false,expectedRevision:old?.revision};}
     r=updateGrant(this.store,actor,b,event);
    }else if(path==='/suggestions/create')r=createSuggestion(this.store,actor,b,suggestionPrepared,event);
    else if(path==='/suggestions/decide')r=decideItems(this.store,actor,b,event);
    else if(path==='/suggestions/withdraw')r=withdrawSuggestion(this.store,actor,b,event);
    else if(path==='/suggestions/comment')r=commentOnSuggestion(this.store,actor,b,event);
    else if(path==='/suggestions/publish')r=publicPublication(acceptPublication(this.store,actor,b,publicationPrepared,event,this.clock()));
    else if(path==='/suggestions/publication/retry')r=publicPublication(retryPublication(this.store,actor,b,event,this.clock()));
    else fail(404,'not_found','找不到這個功能');
    this.store.put('requests',key,b.doc,{payloadHash,result:r});return r;
   });
   await this.schedule();
   return Response.json(prepared&&result.id===prepared.link.id?{...result,token:prepared.token}:result,{status:path==='/suggestions/publish'||path==='/suggestions/publication/retry'?202:prepared||path==='/suggestions/create'?201:200});
  }catch(e){return Response.json({error:e.code||'internal',message:e.status?e.message:'協作服務發生錯誤，請稍後再試'},{status:e.status||500});}
 }
 async legacyPublication(actor,b,event){
  const p=await acceptLegacyWrite(this.store,actor,b,this.gh,this.clock());
  try{const r=await advanceLegacyWrite(this.store,this.gh,p,this.clock());return Response.json(r,{status:201});}finally{await this.schedule();}
 }
 async schedule(){
  const jobs=this.store.sql.exec('SELECT json FROM publications').toArray().map(r=>JSON.parse(r.json)).filter(p=>!['saved','conflict','failed'].includes(p.status));
  const legacy=this.store.sql.exec("SELECT json FROM document_writes").toArray().map(r=>JSON.parse(r.json)).filter(p=>p.kind==='legacy'&&p.status!=='failed');
  const pending=[...jobs,...legacy];
  if(pending.length)await this.ctx.storage.setAlarm(Math.max(this.clock().getTime()+1000,Math.min(...pending.map(p=>p.leaseUntil||p.nextAttemptAt||this.clock().getTime()))));else await this.ctx.storage.deleteAlarm();
 }
 async alarm(){
  const jobs=this.store.sql.exec('SELECT json FROM publications').toArray().map(r=>JSON.parse(r.json)).filter(p=>!['saved','conflict','failed'].includes(p.status));
  for(const p of jobs.filter(p=>(p.leaseUntil||p.nextAttemptAt||0)<=this.clock().getTime()).slice(0,5))await advancePublication(this.store,this.gh,p.id,p.doc,this.clock());
  const legacy=this.store.sql.exec('SELECT json FROM document_writes').toArray().map(r=>JSON.parse(r.json)).filter(p=>p.kind==='legacy'&&p.status!=='failed'&&(p.leaseUntil||p.nextAttemptAt||0)<=this.clock().getTime());
  for(const p of legacy.slice(0,5)){try{await advanceLegacyWrite(this.store,this.gh,p,this.clock());}catch{}}await this.schedule();
 }
}
