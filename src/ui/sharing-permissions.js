import {h,openModal} from '../library/modal.js';

const LABELS={view:'檢視',propose:'提出修訂',decide:'採納修訂',publish:'發布版本',manage:'管理分享'};
const DEFAULT={view:true,propose:true,decide:false,publish:false,manage:false};
export function capabilityFields(capabilities=DEFAULT){
 const inputs={};const root=h('fieldset',{class:'capabilities'},h('legend',{},'權限'));
 for(const [key,label] of Object.entries(LABELS)){
  const input=h('input',{type:'checkbox','data-capability':key});input.checked=!!capabilities[key];inputs[key]=input;
  input.addEventListener('change',()=>{if(key==='view'&&!input.checked)Object.entries(inputs).forEach(([k,n])=>{if(k!=='view')n.checked=false;});else if(key!=='view'&&input.checked)inputs.view.checked=true;});
  root.append(h('label',{},input,label));
 }
 return {root,value:()=>Object.fromEntries(Object.entries(inputs).map(([k,n])=>[k,n.checked]))};
}
export function renderSharingPermissions(container,links,{onSave,onRotate,ownerId}={}){
 container.replaceChildren(...links.map(link=>{
  const name=h('input',{value:link.name,'aria-label':'姓名',maxlength:40}),company=h('input',{value:link.company||'','aria-label':'公司',maxlength:80});
  const enabled=h('input',{type:'checkbox'});enabled.checked=link.enabled;
  const caps=capabilityFields(link.capabilities);
  return h('section',{'data-link-row':link.id,class:'permission-row'},h('div',{class:'permission-identity'},name,company,ownerId===link.id?h('span',{},'主控者'):null),h('label',{},enabled,'有效'),caps.root,
   h('button',{onclick:()=>onSave(link,{name:name.value,company:company.value,enabled:enabled.checked,capabilities:caps.value()})},'儲存權限'),
   ownerId!==link.id?h('button',{onclick:()=>onRotate(link)},'重新產生連結'):null);
 }));
}
export function openSharingPermissions({doc,api,session,onChanged=()=>{}}){
 const call=(path,b={})=>api(path,{doc:doc.slug,requestId:crypto.randomUUID(),...b});
 let policy=session.policy||{enabled:false,policyRevision:0},links=[],creation=null;
 const list=h('div',{id:'permissionList'},'讀取中…'),once=h('div',{id:'linkOnce'}),mode=h('div',{class:'collaboration-mode'});
 const name=h('input',{'aria-label':'姓名',maxlength:40,id:'collaborationName'}),company=h('input',{'aria-label':'公司',maxlength:80,id:'collaborationCompany'}),caps=capabilityFields();
 const create=h('button',{onclick:()=>make()},'產生具名連結');
 const form=h('section',{class:'permission-new'},h('h4',{},'新增成員'),h('label',{},'姓名',name),h('label',{},'公司',company),caps.root,create);
 const modal=openModal({title:'分享權限',body:[h('p',{},doc.title),mode,list,form,once],actions:[{label:'完成'}]});
 async function action(fn){modal.setError('');try{await fn();}catch(e){modal.setError(e.message);}}
 function showToken(r){
  once.replaceChildren();if(!r.token){once.append(h('p',{},'連結已建立，但無法再次顯示。請重新產生連結；原連結會停用。'),h('button',{onclick:()=>action(()=>rotate(r))},'重新產生這條連結'));return;}
  const url=new URL(`/edoc/documents/${doc.slug}/`,location.href); // Respect the current site's document/library root.
  url.pathname=location.pathname.includes('/documents/')?location.pathname:new URL(`documents/${doc.slug}/`,location.href).pathname;
  url.search='';url.hash='edit='+r.token;
  const code=h('code',{id:'onceLink'},url.href);
  once.append(h('p',{},'連結只顯示這一次，請複製交給指定成員。'),code,h('button',{onclick:()=>action(async()=>{await navigator.clipboard.writeText(url.href);})},'複製連結'));
 }
 async function load(){
  policy=await call('/collaboration/settings');
  mode.replaceChildren(h('p',{},policy.enabled?'修訂建議已啟用：採納後才可發布正式版本。':'尚未啟用：既有編輯者可直接更新版本。啟用後，既有編輯者預設只能檢視及提出修訂，主控者保留完整權限。'),h('p',{},'目前操作者：'+session.name),h('button',{onclick:()=>action(changeMode)},policy.enabled?'關閉修訂建議':'啟用修訂建議'));
  form.hidden=!policy.enabled;
  if(policy.enabled){links=(await call('/collaboration/links/list')).links;renderSharingPermissions(list,links,{ownerId:policy.ownerId,onSave:(l,patch)=>action(async()=>{await call('/collaboration/links/update',{id:l.id,expectedRevision:l.revision,...patch});await load();await onChanged();}),onRotate:l=>action(()=>rotate(l))});
   const owners=links.filter(l=>l.enabled&&l.capabilities.manage),select=h('select',{'aria-label':'主控者'},owners.map(l=>h('option',{value:l.id},l.name)));select.value=policy.ownerId;
   mode.append(h('label',{},'主控者',select),h('button',{onclick:()=>action(async()=>{await call('/collaboration/settings',{enabled:true,expectedRevision:policy.policyRevision,ownerId:select.value});await load();await onChanged();})},'轉移主控者'));
  }else{const old=(await call('/links/list')).links;list.replaceChildren(...old.map(l=>h('p',{},l.name+'：檢視、編輯及直接發布')));}
 }
 async function changeMode(){
  let note=policy.enabled?'關閉後既有編輯者可直接發布；建議與歷程仍保留。':'由目前操作者作為主控者，既有成員改為檢視及提出修訂。';
  if(policy.enabled){const pending=(await call('/suggestions/list')).suggestions.filter(s=>!['completed','withdrawn'].includes(s.status));note+=' 尚未結清：'+(pending.map(s=>s.id).join('、')||'無')+'。';}
  if(!confirm(note+' 確定繼續？'))return;
  await call('/collaboration/settings',{enabled:!policy.enabled,expectedRevision:policy.policyRevision});await load();await onChanged();
 }
 async function make(){
  const payload={name:name.value.trim(),company:company.value.trim(),capabilities:caps.value()};if(!payload.name)return modal.setError('請輸入姓名。');
  const fingerprint=JSON.stringify(payload);if(!creation||creation.fingerprint!==fingerprint)creation={fingerprint,requestId:crypto.randomUUID()};
  create.disabled=true;await action(async()=>{const r=await call('/collaboration/links/create',{...payload,requestId:creation.requestId});showToken(r);creation=null;await load();});create.disabled=false;
 }
 async function rotate(link){const current=links.find(l=>l.id===link.id);if(!current)throw new Error('請重新讀取連結');const r=await call('/collaboration/links/rotate',{id:current.id,expectedRevision:current.revision});showToken(r);await load();}
 action(load);return modal;
}
