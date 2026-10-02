import {createSuggestionItems,applySuggestionItems} from '../../../src/engine/suggestion-patches.js';
import {contentContext,prepareContent,trustedContent,hashContent,buildPublishedContent} from '../content.js';
import {policyFor,requireCapability} from './permissions.js';
import {fail,expectRevision,checkedText} from './contracts.js';
export function requireEnabled(store,doc){if(!policyFor(store,doc).enabled)fail(409,'mode_disabled','修訂建議模式目前已關閉');}
export function getSuggestion(store,doc,id){
 const s=store.get('suggestions',doc+':'+id,doc);if(!s)fail(404,'not_found','找不到修訂建議');
 return {...s,items:store.list('items',doc).filter(i=>i.suggestionId===id)};
}
export function selectItems(s,ids){
 if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!s.items.some(i=>i.id===id)))fail(400,'items','建議項目識別碼不符');
 const selected=s.items.filter(i=>ids.includes(i.id)),groups=new Set(selected.map(i=>i.dependencyGroup).filter(Boolean));
 if(s.items.some(i=>groups.has(i.dependencyGroup)&&!ids.includes(i.id)))fail(409,'dependency','相依項目須一起處理');return selected;
}
export function saveSuggestion(store,s){const {items,...record}=s;store.put('suggestions',s.doc+':'+s.id,s.doc,record);return s;}
export function recomputeStatus(s){
 if(s.status==='withdrawn')return s;
 s.status=s.items.some(i=>i.decision==='pending')?'pending':s.items.some(i=>i.decision==='adopt'&&!i.publishedIn)?'ready':'completed';return s;
}
export async function readCurrent(gh,doc,{active=false}={}){
 const result=await gh.readJson(`documents/${doc}/document.json`);
 if(active&&result.json.archived)fail(409,'archived','這份文件已封存；要先還原才能修改');return {...result,doc:result.json};
}
export async function prepareSuggestion(store,actor,b,gh){
 requireCapability(store,actor,b.doc,'propose');requireEnabled(store,b.doc);
 const {doc}=await readCurrent(gh,b.doc,{active:true}),baseHtml=trustedContent(doc.versions[doc.latestVersion].html),baseHash=await hashContent(baseHtml);
 if(b.baseVersion!==doc.latestVersion||b.baseHash!==baseHash)fail(409,'base','正式文件已更新，請重新比較；你的草稿應保留');
 const proposedHtml=prepareContent(b.proposedHtml), patches=createSuggestionItems(baseHtml,proposedHtml,contentContext());
 if(!patches.length)fail(422,'no_changes','沒有有效修訂內容');
 // Check server rendering complexity now, not only after a reviewer spends time deciding.
 await buildPublishedContent(baseHtml,proposedHtml);
 if(b.sourceSuggestionId){const old=getSuggestion(store,b.doc,b.sourceSuggestionId);selectItems(old,b.sourceItemIds);if(b.sourceItemIds.some(id=>old.items.find(i=>i.id===id).publishedIn))fail(409,'published','不能重新提出已發布項目');}
 return {baseHtml,baseHash,proposedHtml,proposedHash:await hashContent(proposedHtml),patches};
}
export function createSuggestion(store,actor,b,prepared,event){
 requireCapability(store,actor,b.doc,'propose');requireEnabled(store,b.doc);
 const next=store.list('suggestions',b.doc).reduce((max,x)=>Math.max(max,Number(x.id.slice(1))),0)+1,id='S'+String(next).padStart(3,'0');
 const s={id,doc:b.doc,baseVersion:b.baseVersion,baseHash:prepared.baseHash,proposedHash:prepared.proposedHash,baseHtml:prepared.baseHtml,proposedHtml:prepared.proposedHtml,revision:1,sourceSuggestionId:b.sourceSuggestionId||null,sourceItemIds:b.sourceItemIds||[],status:'pending',authorId:actor.id};
 const items=prepared.patches.map((p,i)=>({...p,id:id+'-'+String(i+1).padStart(2,'0'),suggestionId:id,doc:b.doc,decision:'pending',publishedIn:null,sourceItemIds:b.sourceItemIds||[]}));
 for(const item of items)store.put('items',b.doc+':'+item.id,b.doc,item);
 saveSuggestion(store,{...s,items});store.appendEvent(event('suggestion.created',{suggestionId:id,afterState:{id,baseVersion:s.baseVersion,itemIds:items.map(i=>i.id),sourceSuggestionId:s.sourceSuggestionId}}));return {...s,items};
}
export function decideItems(store,actor,b,event){
 requireCapability(store,actor,b.doc,'decide');requireEnabled(store,b.doc);const s=getSuggestion(store,b.doc,b.id);expectRevision(s.revision,b.expectedRevision);
 if(s.status==='withdrawn')fail(409,'withdrawn','此修訂建議已撤回');
 if(!['pending','adopt','decline'].includes(b.decision))fail(400,'decision','決定格式不符');
 const selected=selectItems(s,b.itemIds),note=checkedText(b.note,2000,true);
 if(selected.some(i=>i.publishedIn||i.lockedBy))fail(409,'published','已發布或正在發布的項目不能改決定');
 const beforeState=selected.map(i=>({id:i.id,decision:i.decision}));
 for(const i of selected){i.decision=b.decision;store.put('items',b.doc+':'+i.id,b.doc,i);}
 s.revision++;recomputeStatus(s);saveSuggestion(store,s);store.appendEvent(event('items.decided',{suggestionId:s.id,itemIds:b.itemIds,beforeState,afterState:selected.map(i=>({id:i.id,decision:i.decision})),note}));return s;
}
export function withdrawSuggestion(store,actor,b,event){
 requireCapability(store,actor,b.doc,'propose');requireEnabled(store,b.doc);const s=getSuggestion(store,b.doc,b.id);expectRevision(s.revision,b.expectedRevision);
 if(s.authorId!==actor.id)fail(403,'author','只能撤回自己的建議');
 if(s.status==='withdrawn'||s.items.some(i=>i.publishedIn||i.lockedBy))fail(409,'published','此建議已撤回或已有項目發布，不能撤回');
 s.status='withdrawn';s.revision++;saveSuggestion(store,s);store.appendEvent(event('suggestion.withdrawn',{suggestionId:s.id}));return s;
}
export function commentOnSuggestion(store,actor,b,event){
 requireCapability(store,actor,b.doc,'view');const s=getSuggestion(store,b.doc,b.id);if(b.itemIds)selectItems(s,b.itemIds);
 return store.appendEvent(event('suggestion.comment',{suggestionId:s.id,itemIds:b.itemIds||[],note:checkedText(b.text)}));
}
export async function buildSuggestionPreview(store,actor,b,gh){
 requireCapability(store,actor,b.doc,'view');requireEnabled(store,b.doc);const s=getSuggestion(store,b.doc,b.id);expectRevision(s.revision,b.expectedRevision);
 if(s.status==='withdrawn')fail(409,'withdrawn','此建議已撤回');
 const selected=selectItems(s,b.itemIds);if(selected.some(i=>i.decision!=='adopt'||i.publishedIn||i.lockedBy))fail(409,'not_adopted','只能預覽尚未發布的採納項目');
 const {doc}=await readCurrent(gh,b.doc,{active:true}),currentHtml=trustedContent(doc.versions[doc.latestVersion].html);
 if(doc.latestVersion!==s.baseVersion||await hashContent(currentHtml)!==s.baseHash)fail(409,'base','基準已更新，請重新比較並作新決定');
 const cleanHtml=applySuggestionItems(s.baseHtml,s.items,b.itemIds,contentContext()),content=await buildPublishedContent(s.baseHtml,cleanHtml);
 if(cleanHtml===currentHtml)fail(422,'no_changes','沒有有效變更，不建立空版本');
 const latest=getSuggestion(store,b.doc,b.id);expectRevision(latest.revision,s.revision);
 const hash=await hashContent(JSON.stringify({doc:b.doc,id:s.id,baseVersion:s.baseVersion,baseHash:s.baseHash,revision:s.revision,itemIds:[...b.itemIds].sort(),contentHash:content.hash}));
 return {baseVersion:s.baseVersion,baseHash:s.baseHash,revision:s.revision,contentHash:content.hash,previewHash:hash,cleanHtml,html:content.html,stats:content.stats,decisionCounts:{adopt:s.items.filter(i=>i.decision==='adopt').length,decline:s.items.filter(i=>i.decision==='decline').length,pending:s.items.filter(i=>i.decision==='pending').length}};
}
