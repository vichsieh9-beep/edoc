import {h} from '../library/modal.js';
import {el} from './elements.js';
import {state} from './state.js';
import {capability,collaborationApi} from './access.js';
import {displayDate} from '../engine/date.js';
import {prepareSuggestionContent} from '../engine/suggestion-patches.js';
import {BLOCK_SELECTOR} from '../engine/dom.js';
import {toPlainText} from '../engine/text.js';
import {configureRevisionNavigation,selectRevision,orderRevisionEntries} from './revision-navigation.js';

export const decisionLabels={pending:'待討論',adopt:'採納',decline:'不採納'};
const actionLabels={'suggestion.created':'提出修訂建議','items.decided':'調整修訂決定','suggestion.withdrawn':'撤回建議','suggestion.comment':'留言','publication.accepted':'確認發布','publication.saved':'正式版本已儲存','publication.retried':'重試發布','publication.conflict':'發布基準衝突'};
export function renderSuggestionHistory(container,events){
 container.replaceChildren(...events.map(e=>h('article',{class:'suggestion-event'},h('b',{},`${e.actorSnapshot.name} · ${displayDate(e.time)} · ${actionLabels[e.action]||e.action}`),
  e.itemIds?.length?h('p',{},e.itemIds.join('、')):null,e.note?h('p',{},e.note):null,
  e.afterState?h('p',{},Array.isArray(e.afterState)?e.afterState.map(x=>`${x.id}：${decisionLabels[x.decision]||x.decision}`).join('、'):e.afterState.versionKey||''):null)));
}
function text(item,key){
 const raw=item[key]||'';if(item.patch.kind==='text')return raw;
 const plain=toPlainText(raw).trim();if(plain)return plain;
 if(!raw)return '';
 const root=document.createElement('div');root.innerHTML=raw;
 // Patches may contain bare text or inline fragments, not whole paragraphs.
 const fragmentText=root.textContent.trim();if(fragmentText)return fragmentText;
 const image=root.querySelector('img');if(image)return '圖片'+(image.alt?'：'+image.alt:'');
 if(root.querySelector('hr'))return '分隔線';
 return root.querySelector('p,div,br')?'空白段落':raw.trim()?'格式或結構內容':'空白文字';
}
function comparisonText(item,key){return text(item,key).trim()||(item[key]?'空白文字':key==='before'?'無（新增項目）':'無（刪除內容）');}
export function renderSuggestionView(s,{decide,comment,withdraw,compare,preview,history,close}){
 // UI-only expansion choices survive filtering and unrelated decision saves.
 // A newly saved decision resets that item's choice to its default display.
 if(state.suggestionCards?.id!==s.id)state.suggestionCards={id:s.id,choices:new Map(),decisions:new Map()};
 const cardState=state.suggestionCards,cardViews=new Map();
 state.suggestionNotes??=new Map();
 const noteState=id=>{const key=s.id+':'+id;if(!state.suggestionNotes.has(key))state.suggestionNotes.set(key,{open:false,text:''});return state.suggestionNotes.get(key);};
 for(const item of s.items){if(cardState.decisions.get(item.id)!==item.decision)cardState.choices.delete(item.id);cardState.decisions.set(item.id,item.decision);}
 let filter=state.suggestionFilter||'all';const panel=document.getElementById('revisionMarkup');panel.id='revisionMarkup';panel.replaceChildren();panel.setAttribute('aria-label','修訂建議檢視');
 const summary=h('p',{},`${s.id} · ${s.history?.find(e=>e.action==='suggestion.created')?.actorSnapshot.name||'具名成員'} · ${s.status==='withdrawn'?'已撤回':'基於 '+s.baseVersion} · ${s.items.length} 項`);
 const select=h('select',{'aria-label':'顯示項目'},h('option',{value:'all'},'全部修訂'),...Object.entries(decisionLabels).map(([v,l])=>h('option',{value:v},l)));select.value=filter;
 const items=h('div'),bulk=h('div',{class:'suggestion-bulk'}),more=h('details',{class:'suggestion-more',open:!!state.suggestionMore},h('summary',{},'更多操作'),bulk),historyBox=h('section',{id:'suggestionHistory',hidden:true});
 const action=(label,fn,attrs={})=>h('button',{...attrs,onclick:e=>{e.stopPropagation();fn();}},label);
 panel.append(h('h2',{},'修訂建議'),summary,action('返回正式版',close),select,more,items);
 more.addEventListener('toggle',()=>{state.suggestionMore=more.open;});
 const historyButton=action('完整歷程',()=>{
  historyBox.hidden=!historyBox.hidden;
  historyButton.setAttribute('aria-expanded',String(!historyBox.hidden));
  if(!historyBox.hidden)history(historyBox);
 },{'aria-expanded':'false','aria-controls':'suggestionHistory'});
 more.append(historyButton,historyBox);
 if(s.sourceSuggestionId)panel.append(h('p',{},'來源建議：'+s.sourceSuggestionId+' · '+(s.sourceItemIds||[]).join('、')));
 const enabled=state.session?.policy?.enabled&&s.status!=='withdrawn';
 if(enabled&&capability('propose')){
  more.append(action('重新比較並建立草稿',compare));
  if(s.authorId===state.session.actorId&&!s.items.some(i=>i.publishedIn||i.lockedBy))more.append(action('撤回修訂建議',withdraw));
 }
 const proposed=document.createElement('div');proposed.innerHTML=prepareSuggestionContent(s.proposedHtml);
 const proposedBlocks=[...proposed.querySelectorAll(BLOCK_SELECTOR)],liveBlocks=[...el.doc.querySelectorAll(BLOCK_SELECTOR)].filter(n=>!n.closest('.deleted,.deletion-record'));
 const used=new Set();
 const normalizedText=n=>{const clone=n.cloneNode(true);clone.querySelectorAll?.('.deleted,.deletion-record').forEach(x=>x.remove());return clone.textContent.trim();};
 const targets=new Map(s.items.map(i=>{
  const path=i.patch.proposedPath??i.patch.path;let n=path.reduce((node,index)=>node?.childNodes[index],proposed);if(i.patch.kind==='children'&&!i.patch.proposedPath)n=n?.childNodes[i.patch.start]||n;if(n?.nodeType===3)n=n.parentElement;
  const block=n?.closest?.(BLOCK_SELECTOR),approximate=liveBlocks[proposedBlocks.indexOf(block)],wanted=text(i,i.after?'after':'before').trim();
  const candidates=i.after?liveBlocks:[...el.doc.querySelectorAll('.deleted,.deletion-record')];
  let exact=i.after&&approximate&&(normalizedText(approximate)===wanted||i.patch.kind==='group')&&!used.has(approximate)?approximate:candidates.find(x=>!used.has(x)&&(i.after?normalizedText(x):x.textContent.trim())===wanted);
  if(!exact)exact=[...el.doc.querySelectorAll(i.after?'.changed':'.deleted,.deletion-record')].find(x=>!used.has(x)&&x.textContent.trim()===wanted);
  if(exact)used.add(exact);return [i.id,exact||approximate||el.doc];
 }));
 // Keep ordinary replacements on their proposed paragraph. Only disambiguate
 // shared anchors when a frozen item has a separate, identifiable deleted line.
 const occupied=new Set(targets.values()),shared=new Set([...targets.values()].filter((target,index,all)=>target!==el.doc&&all.indexOf(target)!==index));
 const deletedBlocks=[...el.doc.querySelectorAll(BLOCK_SELECTOR)].filter(n=>n.closest('.deleted,.deletion-record'));
 for(const item of s.items){
  if(!item.after||!shared.has(targets.get(item.id)))continue;
  const before=text(item,'before').trim(),original=before&&deletedBlocks.find(n=>!occupied.has(n)&&n.textContent.trim()===before);
  if(original){targets.set(item.id,original);occupied.add(original);}
 }
 function expand(id,open){
  cardState.choices.set(id,open);const view=cardViews.get(id);if(!view)return;
  view.details.hidden=!open;view.card.dataset.collapsed=String(!open);view.toggle.setAttribute('aria-expanded',String(open));view.toggle.setAttribute('aria-label',(open?'收合':'展開')+'修訂 '+id);view.arrow.textContent=open?'▾':'▸';
 }
 function decisionDescription(item){
  const decision=s.history?.findLast(e=>e.action==='items.decided'&&e.itemIds?.includes(item.id));
  const status=decision?`${decision.actorSnapshot.name} 已${item.decision==='pending'?'改回待討論':decisionLabels[item.decision]}`:decisionLabels[item.decision];
  return status+(item.publishedIn?' · 已發布 '+item.publishedIn:item.lockedBy?' · 發布中':'');
 }
 function activate(id,source){
  state.selectedSuggestionItem=id;items.querySelectorAll('[data-suggestion-item]').forEach(card=>card.classList.toggle('selected',card.dataset.suggestionItem===id));el.doc.querySelectorAll('.suggestion-target').forEach(n=>n.classList.remove('suggestion-target'));el.doc.classList.remove('suggestion-target');
  const target=targets.get(id);target?.classList.add('suggestion-target');
  if(source==='doc'||source==='number'){const card=[...items.children].find(n=>n.dataset.suggestionItem===id);if(!card){filter='all';select.value=filter;render();}}
  if(['doc','number','card'].includes(source))expand(id,true);
  selectRevision(id,source==='doc'?'number':source==='toggle'?'card':source);
 }
 el.doc.onclick=event=>{if(state.privateView!=='suggestion'||state.suggestion?.id!==s.id)return;const matches=s.items.filter(i=>{const t=targets.get(i.id);return t!==el.doc&&t?.contains(event.target);});if(matches.length){activate(matches[0].id,'doc');}else{const block=event.target.closest?.(BLOCK_SELECTOR);const nearby=s.items.filter(i=>block&&block.contains(targets.get(i.id)));if(nearby.length===1)activate(nearby[0].id,'doc');}};
 function render(){
  state.suggestionFilter=filter;const visible=s.items.filter(i=>filter==='all'||i.decision===filter);
  const actionable=visible.filter(i=>!i.lockedBy&&!i.publishedIn).map(i=>i.id);
  bulk.replaceChildren();if(enabled&&capability('decide')&&actionable.length)bulk.append(...Object.entries(decisionLabels).map(([v,l])=>action(l+'可見項目',()=>decide(actionable,v))));
  const ordered=orderRevisionEntries(s.items.map(i=>({key:i.id,target:targets.get(i.id),item:i})));
  cardViews.clear();items.replaceChildren(...ordered.filter(entry=>visible.includes(entry.item)).map(({item:i})=>{
   const actionable=enabled&&capability('decide')&&!i.lockedBy&&!i.publishedIn;
   const buttons=actionable?['adopt','decline'].map(v=>action(decisionLabels[v],()=>{activate(i.id);decide([i.id],v);},{class:'decision-'+v,'aria-pressed':String(i.decision===v)})):[];
   const arrow=h('span',{class:'suggestion-card-arrow','aria-hidden':'true'});
   const toggle=action('',()=>{expand(i.id,toggle.getAttribute('aria-expanded')!=='true');activate(i.id,'toggle');},{class:'suggestion-card-toggle','aria-controls':'suggestion-detail-'+i.id});
   const excerpt=text(i,i.after?'after':'before').trim()||comparisonText(i,i.after?'after':'before');
   toggle.append(h('span',{class:'suggestion-card-decision','data-decision':i.decision},decisionLabels[i.decision]),h('span',{class:'suggestion-card-excerpt'},excerpt),arrow);
   const details=h('div',{class:'suggestion-card-details',id:'suggestion-detail-'+i.id},
    h('span',{class:'suggestion-context'},i.section||'正文'),h('small',{class:'suggestion-id'},i.id),
    h('p',{class:'suggestion-change'},'修改前：',h('span',{class:'suggestion-before'},comparisonText(i,'before'))),
    h('p',{class:'suggestion-change'},'建議內容：',h('span',{class:'suggestion-after'},comparisonText(i,'after'))),
    h('p',{class:'suggestion-status',role:'status'},decisionDescription(i)),
    h('div',{class:'suggestion-decisions'},buttons),actionable&&i.decision!=='pending'?action('改回待討論',()=>{activate(i.id);decide([i.id],'pending');},{class:'suggestion-reset'}):null);
   const noteDraft=noteState(i.id),noteList=h('div'),noteSummary=h('summary'),feedback=h('p',{class:'note-feedback',role:'status'});
   const input=h('textarea',{'aria-label':'新增備註',maxlength:2000,placeholder:'說明不採納的原因，或待討論的問題'});input.value=noteDraft.text;
   const saveNote=action('儲存備註',async()=>{
    if(!input.value.trim()||state.collaborationBusy)return;
    feedback.textContent='儲存中…';
    const event=await comment([i.id],input.value);
    if(event){if(!s.history.some(e=>e.id===event.id))s.history.push(event);noteDraft.text='';input.value='';renderNotes();feedback.textContent='備註已儲存';}
    else feedback.textContent='尚未確認備註儲存，輸入內容已保留，可重試。';
    saveNote.disabled=!input.value.trim()||!capability('view');
   });saveNote.disabled=!input.value.trim();
   input.addEventListener('input',()=>{noteDraft.text=input.value;saveNote.disabled=!input.value.trim()||!capability('view');feedback.textContent='';});
   const notes=h('details',{class:'suggestion-notes',open:noteDraft.open,onclick:e=>{e.stopPropagation();activate(i.id);}},noteSummary,noteList,
    capability('view')?h('div',{},input,saveNote,feedback):null);
   notes.addEventListener('toggle',()=>{noteDraft.open=notes.open;});
   function renderNotes(){
    const events=s.history.filter(e=>e.note&&e.itemIds?.includes(i.id));noteSummary.textContent='備註（'+events.length+' 則）';
    noteList.replaceChildren(...events.map(e=>h('article',{class:'suggestion-note-entry'},h('small',{},e.actorSnapshot.name+' · '+displayDate(e.time)),h('p',{},e.note))));
   }renderNotes();
   const card=h('article',{'data-suggestion-item':i.id,class:'suggestion-item',tabindex:0,'aria-label':i.id+' '+(i.section||'正文'),onclick:()=>activate(i.id,'card'),onkeydown:e=>{if(e.target===e.currentTarget&&(e.key==='Enter'||e.key===' ')){e.preventDefault();activate(i.id,'card');}}},
    toggle,details,notes);
   cardViews.set(i.id,{card,toggle,details,arrow});expand(i.id,cardState.choices.get(i.id)??i.decision==='pending');
   return card;
  }));
  configureRevisionNavigation(ordered.map(entry=>({...entry,decision:entry.item.decision,decisionDescription:decisionDescription(entry.item),card:[...items.children].find(n=>n.dataset.suggestionItem===entry.key)})),{context:'suggestion:'+s.id,selectedKey:state.selectedSuggestionItem,onActivate:activate,bindCards:false});
  if(state.selectedSuggestionItem&&s.items.some(i=>i.id===state.selectedSuggestionItem))activate(state.selectedSuggestionItem);
 }
 select.addEventListener('change',()=>{filter=select.value;render();});render();return panel;
}
