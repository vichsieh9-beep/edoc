// Review controls live outside #doc. Selection never alters editor text or undo anchors.
import {el} from './elements.js';
import {state} from './state.js';

let current=null,nextTarget=1;
export function clearRevisionSelection(){
 state.selectedSuggestionItem=null;
 el.doc.querySelectorAll('.suggestion-target').forEach(n=>n.classList.remove('suggestion-target'));
 current?.select(null);
}
const targetKeys=new WeakMap();
export function revisionTargetKey(node){
 if(!targetKeys.has(node))targetKeys.set(node,'target-'+nextTarget++);
 return targetKeys.get(node);
}
export function orderRevisionEntries(entries){
 return [...entries].sort((a,b)=>{
  if(!a.target||!b.target||a.target===b.target)return 0;
  const position=a.target.compareDocumentPosition(b.target);
  if(position&Node.DOCUMENT_POSITION_DISCONNECTED)return 0;
  return position&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;
 });
}
const visible=node=>node?.isConnected&&node.getClientRects().length>0;
function edge(node,last){
 if(!visible(node))return null;
 const blocks=[...node.querySelectorAll('h1,h2,p,li,td,th,blockquote,div,hr')].filter(visible);
 return (last?blocks.at(-1):blocks[0])||node;
}
function neighbour(node,forward){
 for(let n=node;n&&n!==el.doc;n=n.parentElement){
  for(let sibling=forward?n.nextElementSibling:n.previousElementSibling;sibling;sibling=forward?sibling.nextElementSibling:sibling.previousElementSibling){
   const found=edge(sibling,!forward);if(found)return found;
  }
 }
 return null;
}
function location(entry){
 const node=entry.target;
 if(!node?.isConnected||node===el.doc||!el.doc.contains(node))return null;
 if(visible(node))return {...node.getBoundingClientRect().toJSON(),gap:false};
 // Simple markup collapses deleted content, but its number remains at the original gap.
 if(!node.closest('.deleted,.deletion-record'))return null;
 const next=neighbour(node,true),previous=neighbour(node,false),paper=el.doc.getBoundingClientRect();
 const reference=(next||previous)?.getBoundingClientRect();
 const style=getComputedStyle(el.doc),left=paper.left+parseFloat(style.paddingLeft);
 return {left,width:paper.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),height:6,
  top:next?reference.top-6:previous?reference.bottom+6:paper.top+parseFloat(style.paddingTop),gap:true};
}
function keepEditorFocus(event){
 if(state.activeRevision&&(document.activeElement===el.doc||el.doc.contains(document.activeElement)))event.preventDefault();
}
function revealCard(card){
 if(!card)return;
 const panel=document.getElementById('revisionMarkup'),r=card.getBoundingClientRect(),p=panel.getBoundingClientRect();
 if(r.top<p.top+8)panel.scrollTo({top:panel.scrollTop+r.top-p.top-8,behavior:'smooth'});
 else if(r.bottom>p.bottom-8)panel.scrollTo({top:panel.scrollTop+r.bottom-p.bottom+8,behavior:'smooth'});
}
export function clearRevisionNavigation(){current?.destroy();current=null;}
export function refreshRevisionNavigation(){current?.schedule();}
export function selectRevision(key,source){current?.select(key,source);}

export function configureRevisionNavigation(entries,{context,selectedKey,onActivate,bindCards=true}={}){
 const previous=current?.context===context?current.selected:null;
 clearRevisionNavigation();
 const ordered=orderRevisionEntries(entries),review=document.getElementById('documentReview');
 const layer=document.createElement('div');layer.id='revisionNavigation';layer.className='revision-navigation';layer.setAttribute('aria-label','修訂定位');
 const focus=document.createElement('div');focus.className='revision-focus';focus.hidden=true;focus.setAttribute('aria-hidden','true');layer.append(focus);review.append(layer);
 const records=new Map(),listeners=[],badges=[],groups=new Map();let frame=null;
 const activate=(key,source)=>onActivate?onActivate(key,source):selectRevision(key,source);
 function listen(node,event,fn){node.addEventListener(event,fn);listeners.push(()=>node.removeEventListener(event,fn));}
 ordered.forEach((entry,index)=>{
  const number=String(index+1).padStart(2,'0'),card=entry.card;
  const marker=document.createElement('button');marker.type='button';marker.className='revision-number';marker.textContent=number;marker.dataset.revisionNumber=number;
  const description=entry.decisionDescription;
  if(entry.decision){marker.dataset.decision=entry.decision;marker.title=number+'：'+description;}
  marker.setAttribute('aria-label','修訂 '+number+'，'+(description?description+'，':'')+'定位修訂卡');marker.setAttribute('aria-pressed','false');marker.hidden=true;
  listen(marker,'mousedown',keepEditorFocus);listen(marker,'click',()=>activate(entry.key,'number'));layer.append(marker);
  if(card){
   card.dataset.revisionNumber=number;card.id='revision-card-'+number;marker.setAttribute('aria-controls',card.id);
   const badge=document.createElement('span');badge.className='revision-number';badge.textContent=number;badge.setAttribute('aria-hidden','true');if(entry.decision)badge.dataset.decision=entry.decision;
   (card.querySelector('.suggestion-card-toggle')||card).prepend(badge);badges.push(badge);
   listen(card,'mousedown',keepEditorFocus);
   if(bindCards)listen(card,'click',()=>activate(entry.key,'card'));
  }
  records.set(entry.key,{...entry,number,marker});
 });
 function paint(){
  frame=null;const origin=review.getBoundingClientRect(),paper=el.doc.getBoundingClientRect(),style=getComputedStyle(el.doc);
  const gutter=paper.left-origin.left+Math.max(4,parseFloat(style.paddingLeft)-40),positions=[],usedGroups=new Set();
  for(const entry of records.values()){
   const position=location(entry);entry.position=position;entry.marker.hidden=!position;
   if(!position)continue;
   const height=entry.marker.getBoundingClientRect().height||24;
   const lineHeight=parseFloat(getComputedStyle(entry.target).lineHeight)||height;
   const firstLine=position.gap?position.height:Math.min(position.height,lineHeight);
   const y=Math.max(paper.top-origin.top+8,position.top-origin.top+firstLine/2-height/2);
   positions.push({entry,y,height});
  }
  // Hidden deletions and the next edited line may have nearly identical anchors.
  // Group overlapping badges in the same gutter; never use a second column.
  const buckets=[];
  for(const {entry,y,height}of positions.sort((a,b)=>a.y-b.y)){
   const previous=buckets.at(-1);
   if(previous&&y<previous.y+previous.height+2)previous.entries.push(entry);
   else buckets.push({entries:[entry],y,height});
  }
  for(let i=0;i<buckets.length;i++){
   const {entries:bucket,y,height}=buckets[i];
   if(bucket.length===1){
    const marker=bucket[0].marker;if(marker.parentElement!==layer)layer.append(marker);
    Object.assign(marker.style,{left:gutter+'px',top:y+'px'});continue;
   }
   // Several collapsed deletions share one location. Keep their original order
   // in a bounded gutter group instead of moving later numbers above earlier ones.
   const key=bucket.map(e=>e.key).join('\0');usedGroups.add(key);
   let group=groups.get(key);if(!group){group=document.createElement('div');group.className='revision-number-group';group.setAttribute('role','group');groups.set(key,group);layer.append(group);}
   group.setAttribute('aria-label','此處修訂 '+bucket.map(e=>e.number).join('、'));
   Object.assign(group.style,{left:gutter+'px',top:y+'px',maxHeight:Math.max(height,Math.min(80,paper.bottom-origin.top-y-8,buckets[i+1]?buckets[i+1].y-y-2:80))+'px'});
   for(const entry of bucket){if(entry.marker.parentElement!==group)group.append(entry.marker);entry.marker.style.removeProperty('left');entry.marker.style.removeProperty('top');}
  }
  for(const [key,group]of groups)if(!usedGroups.has(key)){group.remove();groups.delete(key);}
  const entry=records.get(current?.selected),position=entry?.position;
  focus.hidden=!position;
  if(position){
   focus.dataset.activeRevisionNumber=entry.number;focus.dataset.gap=String(position.gap);
   Object.assign(focus.style,{left:position.left-origin.left-4+'px',top:position.top-origin.top-2+'px',width:position.width+8+'px',height:position.height+4+'px'});
  }else{delete focus.dataset.activeRevisionNumber;delete focus.dataset.gap;}
 }
 function schedule(){if(frame===null)frame=requestAnimationFrame(paint);}
 const observer=new ResizeObserver(schedule);observer.observe(el.doc);observer.observe(review);listen(window,'resize',schedule);
 const controller={context,selected:null,schedule,
  select(key,source){
   this.selected=records.has(key)?key:null;
   for(const entry of records.values()){
    const active=entry.key===this.selected;entry.marker.setAttribute('aria-pressed',String(active));
    if(entry.card){entry.card.classList.toggle('selected',active);entry.card.setAttribute('aria-current',String(active));if(entry.card.tagName==='BUTTON')entry.card.setAttribute('aria-pressed',String(active));}
   }
   paint();const entry=records.get(this.selected);if(!entry)return;
   const group=entry.marker.parentElement;
   if(group.classList.contains('revision-number-group')){
    const top=entry.marker.offsetTop,bottom=top+entry.marker.offsetHeight;
    if(top<group.scrollTop)group.scrollTop=top;else if(bottom>group.scrollTop+group.clientHeight)group.scrollTop=bottom-group.clientHeight;
   }
   if(source==='number')revealCard(entry.card);
   if(source==='card'){
    const position=entry.position,header=document.getElementById('docHead').getBoundingClientRect();
    if(position&&(position.top<header.bottom+12||position.top+position.height>innerHeight-12))(position.gap?focus:entry.target).scrollIntoView({block:'center',behavior:'smooth'});
   }
  },
  destroy(){
   if(frame!==null)cancelAnimationFrame(frame);observer.disconnect();listeners.forEach(fn=>fn());badges.forEach(b=>b.remove());
   for(const {card}of records.values())if(card){card.classList.remove('selected');delete card.dataset.revisionNumber;card.removeAttribute('aria-current');card.removeAttribute('aria-pressed');card.removeAttribute('id');}
   layer.remove();
  },
 };
 current=controller;controller.select(selectedKey===undefined?previous:selectedKey);return controller;
}
