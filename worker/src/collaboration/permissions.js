import {hashContent} from '../content.js';
import {CAPABILITIES,FULL_CAPABILITIES,DEFAULT_CAPABILITIES,fail,checkedCapabilities,checkedText,expectRevision} from './contracts.js';
const key=(doc,id)=>doc+':'+id;
export const policyFor=(store,doc)=>store.get('policies',doc)||{doc,enabled:false,ownerId:null,policyRevision:0};
export async function resolveActor(store,token,doc,gh){
 if(typeof token!=='string'||token.length<20||token.length>200)fail(401,'unauthorized','編輯連結無效或已停用');
 const tokenHash=await hashContent(token);
 const privateLink=store.list('links',doc).find(x=>!x.legacy&&x.tokenHash===tokenHash);
 if(privateLink){if(!privateLink.enabled)fail(401,'unauthorized','編輯連結無效或已停用');return {id:privateLink.id,linkId:privateLink.id,name:privateLink.name,company:privateLink.company||'',legacy:false};}
 // Legacy tokens must be checked against the live registry on EVERY request.
 const {json:registry,sha:registrySha}=await gh.readJson('edit-links.json');
 const link=(registry.links||[]).find(x=>x.tokenHash===tokenHash);
 if(!link||link.revoked)fail(401,'unauthorized','編輯連結無效或已停用，請向文件維護者索取新的連結');
 if(!(link.documents||[]).some(d=>d===doc||d==='*'))fail(403,'forbidden','這條編輯連結不能修改這份文件');
 const local=store.get('links',key(doc,link.id),doc);
 if(local&&!local.enabled)fail(401,'unauthorized','編輯連結無效或已停用');
 return {id:link.id,linkId:link.id,name:local?.name||link.name,company:local?.company||'',legacy:true,legacyLink:link,registry,registrySha,admin:link.role==='admin'};
}
export function capabilitiesFor(store,actor,doc){
 const grant=store.get('grants',key(doc,actor.id),doc);
 return grant?.capabilities||(!policyFor(store,doc).enabled&&actor.legacy?(actor.admin?FULL_CAPABILITIES:DEFAULT_CAPABILITIES):Object.fromEntries(CAPABILITIES.map(k=>[k,false])));
}
export function requireCapability(store,actor,doc,capability){
 const link=store.get('links',key(doc,actor.id),doc)||store.get('links',actor.id,doc);
 if(link&&!link.enabled)fail(401,'unauthorized','編輯連結無效或已停用');
 if(!capabilitiesFor(store,actor,doc)[capability])fail(403,'forbidden','這條連結沒有這項操作權限');
}
export const publicLink=link=>({id:link.id,name:link.name,company:link.company||'',enabled:link.enabled,revision:link.revision,capabilities:link.capabilities});
export function setPolicy(store,actor,b,event){
 const old=policyFor(store,b.doc);
 if(old.policyRevision===0){if(!actor.admin)fail(403,'forbidden','首次設定需要管理員連結');}
 else if(b.recoverOwner){
  if(!actor.admin||!actor.legacy)fail(403,'forbidden','主控恢復需要有效全域管理員');
  const owner=store.get('links',key(b.doc,old.ownerId),b.doc)||store.get('links',old.ownerId,b.doc);
  const legacyOwner=owner?.legacy&&actor.registry.links.find(l=>l.id===old.ownerId&&!l.revoked);
  const ownerStillValid=owner?.enabled&&capabilitiesFor(store,{id:old.ownerId},b.doc).manage&&(!owner.legacy||legacyOwner);
  if(ownerStillValid)fail(409,'owner','目前主控仍有效，請使用正常轉移');
  const local={...actor.legacyLink,legacy:true,enabled:true,revision:1,company:actor.company,capabilities:FULL_CAPABILITIES};
  store.put('links',key(b.doc,actor.id),b.doc,local);store.put('grants',key(b.doc,actor.id),b.doc,{capabilities:FULL_CAPABILITIES});
  store.put('actors',key(b.doc,actor.id),b.doc,{id:actor.id,name:actor.name,company:actor.company});
 }else requireCapability(store,actor,b.doc,'manage');
 expectRevision(old.policyRevision,b.expectedRevision);
 if(store.list('document_writes',b.doc).length)fail(409,'publishing','文件發布尚未結束，請稍後調整模式');
 if(typeof b.enabled!=='boolean')fail(400,'mode','模式設定不符');
 if(old.policyRevision===0){
  for(const link of actor.registry.links.filter(x=>!x.revoked&&(x.documents||[]).some(d=>d===b.doc||d==='*'))){
   const capabilities=link.id===actor.id?FULL_CAPABILITIES:DEFAULT_CAPABILITIES;
   const local={...link,legacy:true,enabled:true,revision:1,company:'',capabilities};
   store.put('links',key(b.doc,link.id),b.doc,local);store.put('actors',key(b.doc,link.id),b.doc,{id:link.id,name:link.name,company:''});store.put('grants',key(b.doc,link.id),b.doc,{capabilities});
  }
 }
 const ownerId=b.ownerId||old.ownerId||actor.id,owner=store.get('links',key(b.doc,ownerId),b.doc)||store.get('links',ownerId,b.doc);
 if(!owner?.enabled||!capabilitiesFor(store,{id:ownerId},b.doc).manage)fail(409,'owner','主控者必須保留有效管理權');
 const next={doc:b.doc,enabled:b.enabled,ownerId,policyRevision:old.policyRevision+1};store.put('policies',b.doc,b.doc,next);
 store.appendEvent(event(b.recoverOwner?'owner.recovered':'policy.updated',{beforeState:old,afterState:next}));return next;
}
export async function createLink(store,actor,b,event){
 requireCapability(store,actor,b.doc,'manage');
 const name=checkedText(b.name,40),company=checkedText(b.company,80,true),capabilities=checkedCapabilities(b.capabilities||DEFAULT_CAPABILITIES);
 const token=Array.from(crypto.getRandomValues(new Uint8Array(24))).map(x=>x.toString(16).padStart(2,'0')).join(''),tokenHash=await hashContent(token),id=crypto.randomUUID();
 return {token,link:{id,name,company,capabilities,enabled:true,revision:1,tokenHash,legacy:false,doc:b.doc,createdAt:new Date().toISOString()}};
}
export function saveLink(store,actor,b,link,event){
 requireCapability(store,actor,b.doc,'manage');store.put('links',link.id,b.doc,link);store.put('actors',key(b.doc,link.id),b.doc,{id:link.id,name:link.name,company:link.company});store.put('grants',key(b.doc,link.id),b.doc,{capabilities:link.capabilities});
 store.appendEvent(event('link.created',{afterState:publicLink(link)}));return publicLink(link);
}
export function updateGrant(store,actor,b,event){
 requireCapability(store,actor,b.doc,'manage');const id=key(b.doc,b.id),old=store.get('links',id,b.doc)||store.get('links',b.id,b.doc);
 if(!old)fail(404,'not_found','找不到連結');expectRevision(old.revision,b.expectedRevision);
 const capabilities=b.capabilities===undefined?old.capabilities:checkedCapabilities(b.capabilities);
 if(b.enabled!==undefined&&typeof b.enabled!=='boolean')fail(400,'enabled','連結狀態不符');
 const next={...old,capabilities,enabled:b.enabled??old.enabled,name:b.name===undefined?old.name:checkedText(b.name,40),company:b.company===undefined?old.company:checkedText(b.company,80,true),revision:old.revision+1};
 if(policyFor(store,b.doc).ownerId===b.id&&(!next.enabled||!next.capabilities.manage))fail(409,'owner','請先轉移主控者，不能移除最後管理權');
 store.put('links',old.legacy?id:b.id,b.doc,next);store.put('grants',id,b.doc,{capabilities});store.put('actors',id,b.doc,{id:next.id,name:next.name,company:next.company});store.appendEvent(event('link.updated',{beforeState:publicLink(old),afterState:publicLink(next)}));return publicLink(next);
}
